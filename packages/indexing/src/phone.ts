import {
  type CountryCode,
  findPhoneNumbersInText,
  getCountryCallingCode,
  isSupportedCountry,
  Metadata,
  parsePhoneNumberFromString,
} from 'libphonenumber-js';
import { foldDigits } from './normalize';

export type { CountryCode } from 'libphonenumber-js';

/** Spec 7.6: numbers without a country code are read as Israeli unless configured otherwise. */
export const DEFAULT_PHONE_REGION: CountryCode = 'IL';

export function isPhoneRegion(region: string): region is CountryCode {
  return isSupportedCountry(region);
}

/**
 * Parses a phone number to E.164 ("054-123 4567" → "+972541234567"), or null when it is not a
 * possible number. Unicode digits are folded first. The result is the value of the `c` token.
 */
export function parsePhone(
  input: string | null | undefined,
  region: CountryCode = DEFAULT_PHONE_REGION,
): string | null {
  if (!input) return null;
  const text = foldDigits(input.normalize('NFKC')).trim();
  if (!/\d/.test(text)) return null;
  // "00972…" international prefix, which the region's national rules may not cover.
  const cleaned = text.replace(/^\s*00(?=[1-9])/, '+');
  const parsed = parsePhoneNumberFromString(cleaned, region);
  if (!parsed?.isPossible()) return null;
  return parsed.number;
}

export interface PhoneMatch {
  start: number;
  end: number;
  e164: string;
}

const trunkCache = new Map<CountryCode, string | null>();

function trunkPrefix(region: CountryCode): string | null {
  if (trunkCache.has(region)) return trunkCache.get(region)!;
  const metadata = new Metadata();
  metadata.selectNumberingPlan(region);
  const plan = metadata.numberingPlan as { nationalPrefix?: () => string | undefined } | undefined;
  const prefix = plan?.nationalPrefix?.() ?? null;
  trunkCache.set(region, prefix);
  return prefix;
}

const DATE_LIKE = /^(?:\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{2,4})$/;
/** Israeli service numbers dialed without the trunk 0 (1-800, 1-700, 1-599 …). */
const IL_SERVICE = /^1[5-9]\d{2}/;

/**
 * The bundled (min) metadata validates numbers by length only, so digit runs such as dates and
 * order numbers would pass. In regions where national numbers are always written with a trunk 0
 * (Israel, most of Europe), a match without `+`/`00` must start with 0 or the calling code.
 */
function plausible(raw: string, region: CountryCode): boolean {
  const t = raw.trim();
  if (DATE_LIKE.test(t)) return false;
  if (t.startsWith('+') || t.startsWith('(+') || /^\(?00/.test(t)) return true;
  if (trunkPrefix(region) !== '0') return true;
  const digits = t.replace(/\D/g, '');
  if (digits.startsWith('0') || digits.startsWith(getCountryCallingCode(region))) return true;
  return region === 'IL' && IL_SERVICE.test(digits);
}

/** Finds phone numbers in text, with UTF-16 offsets into the given string. */
export function findPhones(text: string, region: CountryCode = DEFAULT_PHONE_REGION): PhoneMatch[] {
  return findPhoneNumbersInText(text, region)
    .filter((m) => plausible(text.slice(m.startsAt, m.endsAt), region))
    .map((m) => ({ start: m.startsAt, end: m.endsAt, e164: m.number.number }));
}
