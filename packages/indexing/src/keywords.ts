import { type FormOptions, wordForms } from './forms';
import { tokenize } from './normalize';

/**
 * Spec 7.5: at most this many keyword tokens per text. A call is indexed from its original and
 * up to two translations, each capped on its own, so one long text never crowds out another.
 */
export const MAX_KEYWORDS_PER_TEXT = 5000;
export const MAX_KEYWORDS_PER_CALL = 3 * MAX_KEYWORDS_PER_TEXT;

export interface KeywordExtraction {
  /** Distinct forms, at most `cap`, in the deterministic keep order. */
  keywords: string[];
  /** Every distinct form with its occurrence count, before the cap (for rules and vocabulary). */
  counts: Map<string, number>;
  /** Number of word tokens in the text. */
  wordCount: number;
  /** True when forms were dropped by the cap. */
  capped: boolean;
}

/**
 * Keyword forms of a text (spec 7.1–7.5). When there are more than `cap` forms, keeps the closest
 * to what was said first (rank), then the most frequent, then by code point order, so the same
 * transcript always yields the same set.
 */
export function extractKeywords(
  text: string,
  opts: FormOptions & { cap?: number } = {},
): KeywordExtraction {
  const cap = opts.cap ?? MAX_KEYWORDS_PER_TEXT;
  const counts = new Map<string, number>();
  const ranks = new Map<string, number>();
  const cache = new Map<string, ReturnType<typeof wordForms>>();
  const tokens = tokenize(text);
  for (const token of tokens) {
    let forms = cache.get(token);
    if (!forms) {
      forms = wordForms(token, opts);
      cache.set(token, forms);
    }
    for (const { form, rank } of forms) {
      counts.set(form, (counts.get(form) ?? 0) + 1);
      const r = ranks.get(form);
      if (r === undefined || rank < r) ranks.set(form, rank);
    }
  }
  const all = [...counts.keys()];
  all.sort((a, b) => {
    const dr = ranks.get(a)! - ranks.get(b)!;
    if (dr) return dr;
    const dc = counts.get(b)! - counts.get(a)!;
    if (dc) return dc;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return {
    keywords: all.slice(0, cap),
    counts,
    wordCount: tokens.length,
    capped: all.length > cap,
  };
}
