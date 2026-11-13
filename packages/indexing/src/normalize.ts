/**
 * Text normalization (spec 7.1). The same functions run on transcripts and on queries, so any
 * difference between the two sides is a missed match: change them only with a vocabulary rebuild.
 *
 * Per character: NFKC, lower-case, strip Hebrew niqqud and cantillation, Arabic harakat and
 * tatweel, Latin diacritics; map Hebrew final letters, Arabic alef/yeh/teh-marbuta variants and
 * Russian ё; fold every Unicode decimal digit to ASCII; unify apostrophes (`'`) and gershayim (`״`).
 * Per token: punctuation is a separator except inner apostrophes, gershayim between letters and
 * digit group separators (`1,200` → `1200`).
 */

/** Niqqud, cantillation and other Hebrew points. Keeps maqaf, paseq, sof pasuq, nun hafukha (punctuation). */
const HEBREW_MARKS = /[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g;
const ARABIC_MARKS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e8\u06ea-\u06edـ]/g;
const LATIN_DIACRITICS = /([a-z])[\u0300-\u036f]+/g;

const CHAR_MAP: Record<string, string> = {
  // Hebrew final letters
  ך: 'כ',
  ם: 'מ',
  ן: 'נ',
  ף: 'פ',
  ץ: 'צ',
  // Hebrew ligatures that survive NFKC
  ױ: 'וי',
  װ: 'וו',
  ײ: 'יי',
  // Arabic letter variants
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ٱ: 'ا',
  ى: 'ي',
  ة: 'ه',
  // Russian
  ё: 'е',
  // Apostrophes and geresh → '
  '’': "'",
  '‘': "'",
  ʼ: "'",
  '׳': "'",
  '`': "'",
  '´': "'",
  // Curly double quotes; between Hebrew letters they become gershayim below
  '“': '"',
  '”': '"',
};
const CHAR_MAP_RE = new RegExp(
  `[${Object.keys(CHAR_MAP)
    .join('')
    .replace(/[\]\\^-]/g, '\\$&')}]`,
  'g',
);

const HEBREW_LETTER = /[א-ת]/;
/** ASCII `"` (or ״) between Hebrew letters is gershayim: צה"ל → צה״ל. */
const GERSHAYIM = /(?<=[א-ת])["״](?=[א-ת])/g;

const digitCache = new Map<number, string>();
const DECIMAL_DIGIT = /\p{Nd}/u;
const NON_ASCII_DIGIT = /(?![0-9])\p{Nd}/gu;

/** Unicode guarantees decimal digits come in contiguous runs of ten starting at zero. */
function digitValue(ch: string): string {
  const cp = ch.codePointAt(0)!;
  const cached = digitCache.get(cp);
  if (cached) return cached;
  let zero = cp;
  while (zero > 0 && DECIMAL_DIGIT.test(String.fromCodePoint(zero - 1))) zero--;
  const value = String((cp - zero) % 10);
  digitCache.set(cp, value);
  return value;
}

/** Folds every Unicode decimal digit (Arabic-Indic, Devanagari, …) to ASCII. Length may change only for astral digits. */
export function foldDigits(text: string): string {
  return text.replace(NON_ASCII_DIGIT, digitValue);
}

/**
 * Folds BMP decimal digits to ASCII without changing string length, so offsets found in the
 * result apply to the original text (used by redaction).
 */
export function foldDigitsInPlace(text: string): string {
  return text.replace(NON_ASCII_DIGIT, (c) => (c.length === 1 ? digitValue(c) : c));
}

/** Character-level normalization of a whole text. Punctuation is kept; see `tokenize`. */
export function normalizeText(text: string): string {
  return foldDigits(
    text
      .normalize('NFKC')
      .toLowerCase()
      .replace(HEBREW_MARKS, '')
      .replace(ARABIC_MARKS, '')
      .normalize('NFD')
      .replace(LATIN_DIACRITICS, '$1')
      .normalize('NFC')
      .replace(CHAR_MAP_RE, (c) => CHAR_MAP[c] ?? c),
  ).replace(GERSHAYIM, '״');
}

/**
 * A token: letters, marks and digits, joined by inner apostrophes, gershayim, or `.`/`,` between
 * digits. Everything else separates tokens.
 */
const TOKEN = /[\p{L}\p{M}\p{N}]+(?:(?:['״]|(?<=\p{N})[.,](?=\p{N}))[\p{L}\p{M}\p{N}]+)*/gu;

/** Splits normalized text into tokens. */
function tokensOf(normalized: string): string[] {
  const out: string[] = [];
  for (const m of normalized.matchAll(TOKEN)) {
    const t = /\p{N}[.,]\p{N}/u.test(m[0]) ? m[0].replace(/(?<=\p{N})[.,](?=\p{N})/gu, '') : m[0];
    out.push(t);
  }
  return out;
}

/** Normalizes and tokenizes text (Hebrew, English, Arabic, Russian, and any other letters). */
export function tokenize(text: string): string[] {
  return tokensOf(normalizeText(text));
}

/** The normal form of one word: its tokens joined, so "e-mail" → "email" and "צה"ל" → "צה״ל". */
export function normalizeWord(word: string): string {
  return tokenize(word).join('');
}

export function isHebrewLetter(ch: string): boolean {
  return HEBREW_LETTER.test(ch);
}

/** Letters and digits only (no apostrophes or gershayim): the length used by length thresholds. */
export function letterCount(form: string): number {
  let n = 0;
  for (const ch of form) if (ch !== "'" && ch !== '״') n++;
  return n;
}

/** The form without apostrophes and gershayim, so "צה״ל" also matches "צהל" and "don't" "dont". */
export function withoutInnerMarks(form: string): string {
  return form.replace(/['״]/g, '');
}
