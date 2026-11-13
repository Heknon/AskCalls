import { letterCount } from './normalize';
import type { ReadonlyVocabulary } from './vocabulary';

/** Spec 7: at most this many forms per query term. */
export const MAX_VARIANTS_PER_TERM = 32;

/**
 * Damerau-Levenshtein distance (optimal string alignment: insertions, deletions, substitutions and
 * adjacent transpositions) over code points. Returns `max + 1` as soon as the distance must exceed
 * `max`, so scanning a large vocabulary stays cheap.
 */
export function damerauLevenshtein(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  const s = [...a];
  const t = [...b];
  const n = s.length;
  const m = t.length;
  if (Math.abs(n - m) > max) return max + 1;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  let cur = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let d = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        d = Math.min(d, prev2[j - 2]! + 1);
      }
      cur[j] = d;
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > max) return max + 1;
    [prev2, prev, cur] = [prev, cur, prev2];
  }
  return prev[m]!;
}

/** Spec 7: no fuzzy matching under 4 letters, distance 1 for 4–6 letters, 2 for 7 or more. */
export function maxEditDistance(form: string): number {
  const n = letterCount(form);
  if (n < 4) return 0;
  return n <= 6 ? 1 : 2;
}

export type VariantKind = 'exact' | 'prefix' | 'fuzzy';

export interface Variant {
  form: string;
  kind: VariantKind;
  /** 0 exact, 1 prefix match, otherwise the edit distance. */
  distance: number;
  frequency: number;
}

export interface ExpandOptions {
  /** The query term ended with `*`: match vocabulary forms that start with it, at any length. */
  explicitPrefix?: boolean;
  /** The "include prefixes" setting: prefix-match terms of 3 or more letters. */
  includePrefixes?: boolean;
  /** Edit-distance matching (default true). */
  fuzzy?: boolean;
  maxVariants?: number;
}

export function compareVariants(a: Variant, b: Variant): number {
  return (
    a.distance - b.distance ||
    b.frequency - a.frequency ||
    (a.form < b.form ? -1 : a.form > b.form ? 1 : 0)
  );
}

/**
 * Vocabulary forms that match one normalized term, ranked by distance then frequency, at most
 * `maxVariants`. The term itself is not included unless it is in the vocabulary.
 */
export function expandTerm(
  term: string,
  vocabulary: ReadonlyVocabulary,
  opts: ExpandOptions = {},
): Variant[] {
  const maxVariants = opts.maxVariants ?? MAX_VARIANTS_PER_TERM;
  const prefix = opts.explicitPrefix || (opts.includePrefixes === true && letterCount(term) >= 3);
  const maxDist = opts.fuzzy === false ? 0 : maxEditDistance(term);
  const termLen = [...term].length;
  const out: Variant[] = [];
  for (const [form, frequency] of vocabulary) {
    if (frequency <= 0) continue;
    if (form === term) {
      out.push({ form, kind: 'exact', distance: 0, frequency });
      continue;
    }
    if (prefix && form.startsWith(term)) {
      out.push({ form, kind: 'prefix', distance: 1, frequency });
      continue;
    }
    if (maxDist > 0 && Math.abs(form.length - term.length) <= maxDist * 2) {
      const formLen = [...form].length;
      if (Math.abs(formLen - termLen) > maxDist) continue;
      const d = damerauLevenshtein(term, form, maxDist);
      if (d <= maxDist) out.push({ form, kind: 'fuzzy', distance: d, frequency });
    }
  }
  return out.sort(compareVariants).slice(0, maxVariants);
}
