import { DomainError } from '@askcalls/domain';
import { z } from 'zod';

/**
 * The user's vocabulary (spec 7.12): every keyword form they have indexed, with how often it
 * occurred. It drives fuzzy query expansion. Stored encrypted as a log of `VocabDelta`s; each delta
 * is a vocabulary of the forms one ingest added (or, with negative counts, one deletion removed).
 */
export type Vocabulary = Map<string, number>;
export type ReadonlyVocabulary = ReadonlyMap<string, number>;

/** Compact the delta log into one delta when it holds more than this many. */
export const VOCAB_COMPACTION_THRESHOLD = 50;

export const VOCAB_FORMAT_VERSION = 1;

const SerializedSchema = z.object({
  v: z.literal(VOCAB_FORMAT_VERSION),
  forms: z.array(z.tuple([z.string().min(1).max(256), z.number().int()])),
});

export function createVocabulary(entries?: Iterable<readonly [string, number]>): Vocabulary {
  const v: Vocabulary = new Map();
  if (entries) for (const [form, count] of entries) addCount(v, form, count);
  return v;
}

function addCount(v: Vocabulary, form: string, count: number): void {
  if (!Number.isFinite(count) || count === 0) return;
  const next = (v.get(form) ?? 0) + count;
  if (next > 0) v.set(form, next);
  else v.delete(form);
}

/** Adds `delta`'s counts into `target` (mutating it) and drops forms whose count reaches zero. */
export function mergeVocabulary(target: Vocabulary, delta: ReadonlyVocabulary): Vocabulary {
  for (const [form, count] of delta) addCount(target, form, count);
  return target;
}

/** A delta that undoes `counts` (when a call is deleted). */
export function negateVocabulary(counts: ReadonlyVocabulary): Vocabulary {
  const out: Vocabulary = new Map();
  for (const [form, count] of counts) if (count !== 0) out.set(form, -count);
  return out;
}

/** Forms in `forms` that the vocabulary does not hold yet. */
export function newForms(vocabulary: ReadonlyVocabulary, forms: Iterable<string>): string[] {
  const out: string[] = [];
  for (const f of forms) if (!vocabulary.has(f)) out.push(f);
  return out;
}

export function needsCompaction(deltaCount: number): boolean {
  return deltaCount > VOCAB_COMPACTION_THRESHOLD;
}

/**
 * Folds a delta log, oldest first, into one vocabulary. Negative counts may appear in the
 * result only when a deletion is replayed before its ingest; positives are what search uses.
 */
export function compactDeltas(deltas: Iterable<ReadonlyVocabulary>): Vocabulary {
  const sums = new Map<string, number>();
  for (const d of deltas) for (const [f, c] of d) sums.set(f, (sums.get(f) ?? 0) + c);
  const out: Vocabulary = new Map();
  for (const [f, c] of sums) if (c !== 0) out.set(f, c);
  return out;
}

/** UTF-8 JSON, sorted by form, so equal vocabularies serialize to equal bytes. Encryption is the caller's. */
export function serializeVocabulary(v: ReadonlyVocabulary): Uint8Array {
  const forms = [...v].filter(([, c]) => c !== 0).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return new TextEncoder().encode(JSON.stringify({ v: VOCAB_FORMAT_VERSION, forms }));
}

/** Inverse of `serializeVocabulary`. Counts are kept as stored (deltas may be negative). */
export function deserializeVocabulary(bytes: Uint8Array): Vocabulary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new DomainError('invalid', 'Vocabulary could not be decoded');
  }
  const result = SerializedSchema.safeParse(parsed);
  if (!result.success) throw new DomainError('invalid', 'Vocabulary has an unexpected shape');
  const out: Vocabulary = new Map();
  for (const [f, c] of result.data.forms) out.set(f, (out.get(f) ?? 0) + c);
  return out;
}
