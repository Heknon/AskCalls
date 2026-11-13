import {
  type CountryCode,
  findPhoneNumbersInText,
  isSupportedCountry,
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
  if (!parsed || !parsed.isPossible()) return null;
  return parsed.number;
}

export interface PhoneMatch {
  start: number;
  end: number;
  e164: string;
}

/** Finds phone numbers in text, with UTF-16 offsets into the given string. */
export function findPhones(text: string, region: CountryCode = DEFAULT_PHONE_REGION): PhoneMatch[] {
  return findPhoneNumbersInText(text, region).map((m) => ({
    start: m.startsAt,
    end: m.endsAt,
    e164: m.number.number,
  }));
}
