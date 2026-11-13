import {
  type CallDirection,
  DomainError,
  type DurationBucket,
  durationBucket,
  type Transcript,
} from '@askcalls/domain';
import { type ChunkOptions, chunkSegments, makeSnippet } from './chunk';
import { EMBEDDING_PASSAGE_PREFIX } from './constants';
import {
  classifyIntents,
  DEFAULT_INTENT_THRESHOLD,
  type EmbedFn,
  type IntentMatch,
  type IntentPrototype,
} from './intents';
import { extractKeywords, MAX_KEYWORDS_PER_CALL } from './keywords';
import { tokenize } from './normalize';
import { type CountryCode, DEFAULT_PHONE_REGION, parsePhone } from './phone';
import { createRedactor, REDACTION_KINDS, type RedactionKind } from './redact';
import { evaluateRules, type Rule } from './rules';
import type { StopwordSet } from './stopwords';
import { buildSynonymLookup, type SynonymEntry, type SynonymLookup } from './synonyms';
import type { Vocabulary } from './vocabulary';

/** A contact from the user's encrypted contact list (`UserData:contacts`). */
export interface Contact {
  name?: string | null;
  phones?: readonly string[];
}

export interface CallMetaInput {
  /** Any format; parsed to E.164 with the default region. */
  phone?: string | null;
  contactName?: string | null;
  direction?: CallDirection;
  durationSec?: number | null;
}

export interface AnalyzeCallInput {
  transcript: Transcript;
  meta?: CallMetaInput;
  contacts?: readonly Contact[];
  /** Entries from `UserData:synonyms`, or a lookup built once with `buildSynonymLookup`. */
  synonyms?: readonly SynonymEntry[] | SynonymLookup;
  stopwords?: StopwordSet;
  /** Phone region for numbers without a country code (default IL). */
  region?: CountryCode;
  keywordCap?: number;
  chunking?: ChunkOptions;
}

export interface IndexCallInput extends AnalyzeCallInput {
  /** Embeds `passage: `-prefixed texts; one vector per text. */
  embed: EmbedFn;
  /** Built once per session with `buildIntentPrototypes`. */
  intents?: readonly IntentPrototype[];
  intentThreshold?: number;
  /** Parsed with `parseRules`. */
  rules?: readonly Rule[];
}

export interface PreparedChunk {
  ord: number;
  /** Redacted chunk text. */
  text: string;
  /** `passage: ` + redacted text: what gets embedded. */
  embedText: string;
  /** Redacted text cut to 300 characters: what gets encrypted into `snippetCt`. */
  snippet: string;
  startSec: number;
  endSec: number;
}

export interface IndexedChunk extends PreparedChunk {
  embedding: Float32Array;
}

/** Everything indexing derives without embeddings. */
export interface AnalyzedCall {
  /** Normal forms to hash with kind `w` (≤ 5,000). */
  keywords: string[];
  /** All forms with occurrence counts, before the cap (rules use these). */
  keywordCounts: Map<string, number>;
  /** Counts of the kept keywords: the call's vocabulary delta. */
  vocabularyDelta: Vocabulary;
  keywordsCapped: boolean;
  wordCount: number;
  /** E.164 to hash with kind `c`, or null. */
  contactE164: string | null;
  /** The contact-list entry whose phone matched, if any. */
  contactName: string | null;
  direction: CallDirection;
  durationSec: number | null;
  durationBucket: DurationBucket | null;
  chunks: PreparedChunk[];
  redactionCounts: Record<RedactionKind, number>;
  /** Normalized transcript text: SHA-256 it for the `x` content token. */
  contentText: string;
}

export interface IndexedCall extends Omit<AnalyzedCall, 'chunks'> {
  chunks: IndexedChunk[];
  intents: IntentMatch[];
  intentIds: string[];
  /** Tag ids from rules (`__star` for stars), to hash with kind `t`. */
  tagIds: string[];
  matchedRuleIds: string[];
}

/** The text whose SHA-256 is the content token: tokens joined by single spaces. */
export function contentText(text: string): string {
  return tokenize(text).join(' ');
}

function lookupOf(synonyms: AnalyzeCallInput['synonyms']): SynonymLookup | undefined {
  if (!synonyms) return undefined;
  return synonyms instanceof Map
    ? synonyms
    : buildSynonymLookup(synonyms as readonly SynonymEntry[]);
}

/** E.164 numbers of a contact list. */
export function contactPhoneSet(contacts: readonly Contact[], region: CountryCode): Set<string> {
  const set = new Set<string>();
  for (const c of contacts) {
    for (const p of c.phones ?? []) {
      const e164 = parsePhone(p, region);
      if (e164) set.add(e164);
    }
  }
  return set;
}

/** Synchronous part of indexing: keywords, contact, duration, redacted chunks. */
export function analyzeCall(input: AnalyzeCallInput): AnalyzedCall {
  const { transcript } = input;
  const meta = input.meta ?? {};
  const region = input.region ?? DEFAULT_PHONE_REGION;
  const contacts = input.contacts ?? [];
  const formOpts = { synonyms: lookupOf(input.synonyms), stopwords: input.stopwords };

  const extraction = extractKeywords(transcript.text, {
    ...formOpts,
    cap: input.keywordCap ?? MAX_KEYWORDS_PER_CALL,
  });
  const vocabularyDelta: Vocabulary = new Map();
  for (const k of extraction.keywords) vocabularyDelta.set(k, extraction.counts.get(k)!);

  const contactE164 = parsePhone(meta.phone, region);
  const matchedContact = contactE164
    ? contacts.find((c) => (c.phones ?? []).some((p) => parsePhone(p, region) === contactE164))
    : undefined;

  const lastEnd = transcript.segments.reduce((m, s) => Math.max(m, s.end), 0);
  const durationSec =
    meta.durationSec !== undefined && meta.durationSec !== null && meta.durationSec >= 0
      ? meta.durationSec
      : lastEnd > 0
        ? lastEnd
        : null;

  const names = [...contacts.map((c) => c.name ?? ''), meta.contactName ?? ''].filter(
    (n) => n.trim() !== '',
  );
  const redactor = createRedactor({ names, region, stopwords: input.stopwords });
  const redactionCounts = Object.fromEntries(REDACTION_KINDS.map((k) => [k, 0])) as Record<
    RedactionKind,
    number
  >;
  const redactedSegments = transcript.segments.map((s) => {
    const r = redactor.redact(s.text);
    for (const k of REDACTION_KINDS) redactionCounts[k] += r.counts[k];
    return { start: s.start, end: s.end, text: r.text };
  });
  const chunks = chunkSegments(redactedSegments, input.chunking).map(
    (c): PreparedChunk => ({
      ord: c.ord,
      text: c.text,
      embedText: EMBEDDING_PASSAGE_PREFIX + c.text,
      snippet: makeSnippet(c.text),
      startSec: c.startSec,
      endSec: c.endSec,
    }),
  );

  return {
    keywords: extraction.keywords,
    keywordCounts: extraction.counts,
    vocabularyDelta,
    keywordsCapped: extraction.capped,
    wordCount: extraction.wordCount,
    contactE164,
    contactName: matchedContact?.name ?? meta.contactName ?? null,
    direction: meta.direction ?? 'unknown',
    durationSec,
    durationBucket: durationSec === null ? null : durationBucket(durationSec),
    chunks,
    redactionCounts,
    contentText: contentText(transcript.text),
  };
}

/**
 * Indexes one call on the device (spec 7): everything except hashing and encryption. The caller
 * hashes `keywords` (w), `contactE164` (c), `tagIds` (t) and `contentText` (x), and encrypts the
 * snippets with the call's DEK.
 */
export async function indexCall(input: IndexCallInput): Promise<IndexedCall> {
  const synonyms = lookupOf(input.synonyms);
  const analyzed = analyzeCall({ ...input, synonyms });
  const region = input.region ?? DEFAULT_PHONE_REGION;

  const vectors = analyzed.chunks.length
    ? await input.embed(analyzed.chunks.map((c) => c.embedText))
    : [];
  if (vectors.length !== analyzed.chunks.length) {
    throw new DomainError('provider_error', 'Embedder returned a different number of vectors', {
      expected: analyzed.chunks.length,
      got: vectors.length,
    });
  }
  const chunks: IndexedChunk[] = analyzed.chunks.map((c, i) => ({ ...c, embedding: vectors[i]! }));

  const intents = classifyIntents(vectors, input.intents ?? [], {
    threshold: input.intentThreshold ?? DEFAULT_INTENT_THRESHOLD,
  });
  const intentIds = intents.map((i) => i.id);

  const outcome = evaluateRules(
    input.rules ?? [],
    {
      keywordCounts: analyzed.keywordCounts,
      intentIds,
      phoneE164: analyzed.contactE164,
      contactPhones: contactPhoneSet(input.contacts ?? [], region),
      durationBucket: analyzed.durationBucket,
      direction: analyzed.direction,
      texts: input.transcript.segments.map((s) => s.text),
    },
    { synonyms, stopwords: input.stopwords, region },
  );

  return {
    ...analyzed,
    chunks,
    intents,
    intentIds,
    tagIds: outcome.tagIds,
    matchedRuleIds: outcome.matchedRuleIds,
  };
}
