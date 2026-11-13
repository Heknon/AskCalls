import { z } from 'zod';
import { normalizeWord, tokenize } from './normalize';

/**
 * The user's synonym map (spec 7.3), stored encrypted in `UserData:synonyms`.
 * `{ canonical: 'iphone', variants: ['אייפון', 'aifon'] }` means every variant also indexes and
 * queries as `iphone`. Canonical forms and variants are single words; multi-word entries are
 * rejected by the schema.
 */
const SingleWord = z.string().min(1).max(64).refine(isSingleWord, 'Must be a single word');

export const SynonymEntrySchema = z.object({
  canonical: SingleWord,
  variants: z.array(SingleWord).max(100),
});
export const SynonymMapSchema = z.array(SynonymEntrySchema).max(2000);

export type SynonymEntry = z.infer<typeof SynonymEntrySchema>;

/** Normalized variant → normalized canonical forms. */
export type SynonymLookup = ReadonlyMap<string, readonly string[]>;

export const EMPTY_SYNONYMS: SynonymLookup = new Map();

/** True when `text` normalizes to exactly one word. */
export function isSingleWord(text: string): boolean {
  return tokenize(text).length === 1;
}

/**
 * Builds the lookup. Entries whose canonical or variant is not a single word are skipped, so a
 * stored map written by an older client never breaks indexing. A variant may map to several
 * canonicals; the canonical itself maps to nothing (it already is the canonical).
 */
export function buildSynonymLookup(entries: readonly SynonymEntry[] | undefined): SynonymLookup {
  const map = new Map<string, string[]>();
  for (const entry of entries ?? []) {
    if (!isSingleWord(entry.canonical)) continue;
    const canonical = normalizeWord(entry.canonical);
    for (const v of entry.variants) {
      if (!isSingleWord(v)) continue;
      const variant = normalizeWord(v);
      if (variant === canonical) continue;
      const list = map.get(variant) ?? [];
      if (!list.includes(canonical)) list.push(canonical);
      map.set(variant, list);
    }
  }
  return map;
}
