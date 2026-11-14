/**
 * Every date and time the app shows, through `Intl` in the UI locale ("en-GB", "he-IL") and the
 * device's time zone.
 */

const DAY_MS = 86_400_000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function capitalise(s: string, locale: string) {
  return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
}

/** "14:32": a 24-hour clock in every locale. */
export function formatTime(at: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/** "12 Nov 2026". */
export function formatDate(at: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(at);
}

/** "Today, 14:32", "Yesterday, 18:05", "10 Nov, 09:12", "10 Nov 2024, 09:12". */
export function formatWhen(at: Date, locale: string, now: Date = new Date()) {
  const time = formatTime(at, locale);
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
