/** Formatting shared by the call components. Everything goes through `Intl` in the UI locale. */

import { parsePhoneNumberFromString } from 'libphonenumber-js';

const DAY_MS = 86_400_000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function capitalise(s: string, locale: string) {
  return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
}

/** "Today, 14:32", "Yesterday, 18:05", "10 Nov, 09:12", "10 Nov 2024, 09:12". */
export function formatWhen(at: Date, locale: string, now: Date = new Date()) {
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days === 0 || days === 1) {
    const word = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day');
    return `${capitalise(word, locale)}, ${time}`;
  }
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: at.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(at);
  return `${date}, ${time}`;
}

/** Units follow the language, not the region: "8 min" in every English locale (design-system 8.7). */
const unitLocale = (locale: string) => new Intl.Locale(locale).language;

/** "8 min" (or "45 sec" under a minute); `long` gives "8 minutes" for screen readers. */
export function formatDuration(seconds: number, uiLocale: string, long = false) {
  const locale = unitLocale(uiLocale);
  const unitDisplay = long ? 'long' : 'short';
  if (seconds < 60) {
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'second', unitDisplay }).format(
      Math.round(seconds),
    );
  }
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay }).format(
    Math.round(seconds / 60),
  );
}

/** Media clock: "0:48", "12:05", "1:02:09". */
export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "2 minutes 14 seconds" for `aria-valuetext`. */
export function formatSpokenClock(totalSeconds: number, uiLocale: string) {
  const locale = unitLocale(uiLocale);
  const s = Math.max(0, Math.floor(totalSeconds));
  const unit = (n: number, u: 'minute' | 'second') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'long' }).format(n);
  const m = Math.floor(s / 60);
  return m > 0 ? `${unit(m, 'minute')} ${unit(s % 60, 'second')}` : unit(s, 'second');
}

/**
 * Phone numbers for reading, grouped by the number's own country ("+44 20 7946 0958"). Israeli
 * numbers keep their hyphenated national grouping after the country code ("+972 52-555-0134",
 * national "052-555-0134"; design-system 8.5). Input that does not parse is returned as given.
 */
export function formatPhone(e164: string, format: 'international' | 'national' = 'international') {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  if (format === 'national') return parsed.formatNational();
  if (parsed.countryCallingCode === '972')
    return `+972 ${parsed.formatNational().replace(/^0/, '')}`;
  return parsed.formatInternational();
}

/** "8 min 12 sec": the call header's exact length. */
export function formatDurationExact(seconds: number, uiLocale: string) {
  const locale = unitLocale(uiLocale);
  const s = Math.max(0, Math.round(seconds));
  const unit = (n: number, u: 'minute' | 'second') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'short' }).format(n);
  const m = Math.floor(s / 60);
  if (m === 0) return unit(s, 'second');
  return s % 60 === 0 ? unit(m, 'minute') : `${unit(m, 'minute')} ${unit(s % 60, 'second')}`;
}

/** "12 Nov 2026, 14:32". */
export function formatDateTime(at: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}
