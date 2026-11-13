import { matchWithPrefix } from './hebrew';
import {
  foldDigitsInPlace,
  letterCount,
  normalizeWord,
  tokenize,
  withoutInnerMarks,
} from './normalize';
import { type CountryCode, DEFAULT_PHONE_REGION, findPhones } from './phone';
import { DEFAULT_STOPWORDS, type StopwordSet } from './stopwords';

/**
 * Redaction for embeddings and snippets (spec 7.7). Embeddings and snippets leave the device
 * (as vectors and as ciphertext the user may later send to an LLM), so personal data is replaced
 * with placeholders first.
 */
export type RedactionKind = 'EMAIL' | 'IBAN' | 'CARD' | 'ID' | 'PHONE' | 'NAME';

export const REDACTION_KINDS: readonly RedactionKind[] = [
  'EMAIL',
  'IBAN',
  'CARD',
  'ID',
  'PHONE',
  'NAME',
];

export interface RedactionResult {
  text: string;
  counts: Record<RedactionKind, number>;
}

export interface RedactorOptions {
  /** Contact-list names and the call's contact name. Each word of each name is redacted. */
  names?: readonly string[];
  region?: CountryCode;
  stopwords?: StopwordSet;
}

export interface Redactor {
  redact(text: string): RedactionResult;
}

interface Hit {
  start: number;
  end: number;
  kind: RedactionKind;
  /** Replacement text; defaults to `[KIND]`. */
  replacement?: string;
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
const IBAN_CANDIDATE = /(?<![\p{L}\p{N}])[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}/giu;
const CARD_CANDIDATE = /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g;
const ID_CANDIDATE = /(?<![\d-])(\d{8}-?\d)(?![\d-])/g;
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’ʼ׳"״][\p{L}\p{M}\p{N}]+)*/gu;

/** Luhn checksum (cards). */
export function isLuhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Israeli ID (Teudat Zehut) checksum over 9 digits; shorter numbers are zero-padded. */
export function isIsraeliIdValid(id: string): boolean {
  const digits = id.replace(/-/g, '');
  if (!/^\d{5,9}$/.test(digits) || /^0+$/.test(digits)) return false;
  const padded = digits.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = (padded.charCodeAt(i) - 48) * ((i % 2) + 1);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

/** ISO 13616 mod-97 check. */
export function isIbanValid(iban: string): boolean {
  const s = iban.replace(/[ -]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of v) rem = (rem * 10 + (digit.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

/** The original characters of the first `letters` letters of `raw`, with their niqqud. */
function originalPrefix(raw: string, letters: number): string {
  if (letters === 0) return '';
  let count = 0;
  let i = 0;
  const chars = [...raw];
  for (; i < chars.length; i++) {
    if (/\p{M}/u.test(chars[i]!)) continue;
    if (count === letters) break;
    count++;
  }
  return chars.slice(0, i).join('');
}

function nameSet(names: readonly string[], stopwords: StopwordSet): Set<string> {
  const set = new Set<string>();
  for (const name of names) {
    for (const token of tokenize(name)) {
      for (const t of new Set([token, withoutInnerMarks(token)])) {
        if (letterCount(t) >= 2 && !stopwords.has(t) && !/^\d+$/.test(t)) set.add(t);
      }
    }
  }
  return set;
}

export function createRedactor(opts: RedactorOptions = {}): Redactor {
  const region = opts.region ?? DEFAULT_PHONE_REGION;
  const names = nameSet(opts.names ?? [], opts.stopwords ?? DEFAULT_STOPWORDS);
  const wordCache = new Map<string, { prefix: number; suffix: string } | null>();

  const nameMatch = (raw: string): { prefix: number; suffix: string } | null => {
    const cached = wordCache.get(raw);
    if (cached !== undefined) return cached;
    let result: { prefix: number; suffix: string } | null = null;
    const form = normalizeWord(raw);
    for (const [candidate, suffix] of [
      [form, ''],
      [withoutInnerMarks(form), ''],
      ...(form.endsWith("'s") ? [[form.slice(0, -2), raw.slice(-2)]] : []),
    ] as Array<[string, string]>) {
      const m = matchWithPrefix(candidate, names);
      if (m) {
        result = { prefix: letterCount(m.prefix), suffix };
        break;
      }
    }
    wordCache.set(raw, result);
    return result;
  };

  return {
    redact(text: string): RedactionResult {
      const counts = Object.fromEntries(REDACTION_KINDS.map((k) => [k, 0])) as Record<
        RedactionKind,
        number
      >;
      if (!text) return { text, counts };
      const folded = foldDigitsInPlace(text);
      const hits: Hit[] = [];

      for (const m of folded.matchAll(EMAIL)) {
        hits.push({ start: m.index, end: m.index + m[0].length, kind: 'EMAIL' });
      }
      for (const m of folded.matchAll(IBAN_CANDIDATE)) {
        // The candidate may run into following words; take the longest prefix that validates.
        for (let len = m[0].length; len >= 15; len--) {
          const sub = m[0].slice(0, len);
          if (/[ -]$/.test(sub)) continue;
          if (isIbanValid(sub)) {
            hits.push({ start: m.index, end: m.index + len, kind: 'IBAN' });
            break;
          }
        }
      }
      for (const m of folded.matchAll(CARD_CANDIDATE)) {
        const digits = m[0].replace(/[ -]/g, '');
        if (isLuhnValid(digits) && !/^(\d)\1+$/.test(digits)) {
          hits.push({ start: m.index, end: m.index + m[0].length, kind: 'CARD' });
        }
      }
      for (const m of folded.matchAll(ID_CANDIDATE)) {
        if (isIsraeliIdValid(m[1]!))
          hits.push({ start: m.index, end: m.index + m[0].length, kind: 'ID' });
      }
      for (const p of findPhones(folded, region)) {
        hits.push({ start: p.start, end: p.end, kind: 'PHONE' });
      }
      if (names.size > 0) {
        for (const m of text.matchAll(WORD)) {
          const match = nameMatch(m[0]);
          if (!match) continue;
          const prefix = originalPrefix(m[0], match.prefix);
          hits.push({
            start: m.index,
            end: m.index + m[0].length,
            kind: 'NAME',
            replacement: `${prefix}[NAME]${match.suffix}`,
          });
        }
      }

      // Earlier kinds win overlaps (an email's digits are not a phone); then longer spans.
      const priority = (k: RedactionKind) => REDACTION_KINDS.indexOf(k);
      hits.sort(
        (a, b) => priority(a.kind) - priority(b.kind) || b.end - b.start - (a.end - a.start),
      );
      const accepted: Hit[] = [];
      for (const h of hits) {
        if (accepted.every((a) => h.end <= a.start || h.start >= a.end)) accepted.push(h);
      }
      accepted.sort((a, b) => a.start - b.start);

      let out = '';
      let pos = 0;
      for (const h of accepted) {
        out += text.slice(pos, h.start) + (h.replacement ?? `[${h.kind}]`);
        pos = h.end;
        counts[h.kind]++;
      }
      out += text.slice(pos);
      return { text: out, counts };
    },
  };
}

/** One-off redaction. Prefer `createRedactor` when redacting many segments with the same names. */
export function redact(text: string, opts: RedactorOptions = {}): RedactionResult {
  return createRedactor(opts).redact(text);
}
