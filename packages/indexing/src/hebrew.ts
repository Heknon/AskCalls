import { isHebrewLetter, letterCount } from './normalize';

/** The seven Hebrew prefix letters (spec 7.2). */
export const HEBREW_PREFIX_LETTERS = ['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ'] as const;

const PREFIX_LETTER_SET: ReadonlySet<string> = new Set(HEBREW_PREFIX_LETTERS);

/**
 * Prefix sequences Hebrew allows, in order: and (ו), that/when (ש, כש, לכש, מש), a preposition
 * (ב כ ל מ), the article (ה). Covers ו, ה, ב, וה, שב, מה, וכש, שמה, ולכשה … Over-matching is
 * accepted (מספר also yields ספר); missing a real prefix is not.
 */
const PREFIX_SEQUENCE = /^ו?(?:ש|כש|לכש|מש)?[בכלמ]?ה?$/;

/** Longest prefix removed. */
export const MAX_PREFIX_LETTERS = 4;
/** Words of this many letters or fewer are never expanded (spec: "longer than 3 letters"). */
export const MIN_EXPANDABLE_LETTERS = 4;
/** A stripped form keeps at least this many letters. */
export const MIN_STEM_LETTERS = 2;

/**
 * Forms of a normalized Hebrew word with one or more leading prefix letters removed, shortest
 * prefix first. "וכשהגענו" → ["כשהגענו", "שהגענו", "הגענו", …]. Returns [] for non-Hebrew words
 * and words of 3 letters or fewer.
 */
export function hebrewPrefixForms(form: string): string[] {
  if (!form || !isHebrewLetter(form[0]!) || letterCount(form) < MIN_EXPANDABLE_LETTERS) return [];
  const out: string[] = [];
  const max = Math.min(MAX_PREFIX_LETTERS, form.length);
  for (let k = 1; k <= max; k++) {
    if (!PREFIX_LETTER_SET.has(form[k - 1]!)) break;
    const rest = form.slice(k).replace(/^['״]+/, '');
    if (letterCount(rest) < MIN_STEM_LETTERS) break;
    if (PREFIX_SEQUENCE.test(form.slice(0, k))) out.push(rest);
  }
  return out;
}

/**
 * Splits off the longest prefix sequence whose remainder equals one of `targets`. Used to keep the
 * grammatical prefix when redacting a name: "לדני" → { prefix: "ל", stem: "דני" }.
 */
export function matchWithPrefix(
  form: string,
  targets: ReadonlySet<string>,
): { prefix: string; stem: string } | null {
  if (targets.has(form)) return { prefix: '', stem: form };
  if (!form || !isHebrewLetter(form[0]!)) return null;
  const max = Math.min(MAX_PREFIX_LETTERS, form.length - 1);
  for (let k = 1; k <= max; k++) {
    if (!PREFIX_LETTER_SET.has(form[k - 1]!)) break;
    const prefix = form.slice(0, k);
    const stem = form.slice(k);
    if (PREFIX_SEQUENCE.test(prefix) && targets.has(stem)) return { prefix, stem };
  }
  return null;
}
