import { type CountryCode, DEFAULT_PHONE_REGION, parsePhone } from '@askcalls/indexing';
import { baseName } from './pairing';

export interface FileNameMeta {
  format: 'samsung' | 'iphone';
  /** E.164 when the name holds a parsable number. */
  phone: string | null;
  /** The name part when it is not a number (the phone's contact name). */
  contactName: string | null;
  startedAt: string | null;
}

/** Recorder prefixes in English and Hebrew, stripped before reading the contact part. */
const SAMSUNG_PREFIX = /^(?:call[ _-]?recording|הקלטת[ _]שיחה)[ _-]*/i;
const IPHONE_PREFIX = /^(?:call[ _]with|call[ _]recording|recording|שיחה[ _]עם|הקלטה)[ _-]*/i;

/** `Call recording <name or number>_YYMMDD_HHMMSS` (also `YYYYMMDD`, also without the prefix). */
const SAMSUNG = /^(.*?)[_ ](\d{6}|\d{8})_(\d{6})(?:_\d+)?$/;

/** `[Call with ]<name or number>[ - ]YYYY-MM-DD[ at ]HH.MM[.SS]`, or the date first. */
const IPHONE_DATE =
  /(\d{4})-(\d{2})-(\d{2})(?:[ _T]+(?:at[ _]+)?(\d{1,2})[.:-](\d{2})(?:[.:-](\d{2}))?)?/i;

function utcIso(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  offsetMinutes: number,
): string | null {
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return null;
  const local = Date.UTC(y, mo - 1, d, h, mi, s);
  if (Number.isNaN(local) || new Date(local).getUTCDate() !== d) return null;
  return new Date(local - offsetMinutes * 60_000).toISOString();
}

function who(
  part: string,
  region: CountryCode,
): { phone: string | null; contactName: string | null } {
  const text = part
    .replace(/[_]+/g, ' ')
    .replace(/^[\s\-–]+|[\s\-–]+$/g, '')
    .trim();
  if (!text) return { phone: null, contactName: null };
  const phone = /\d{5,}/.test(text.replace(/[\s()\-.]/g, '')) ? parsePhone(text, region) : null;
  return phone ? { phone, contactName: null } : { phone: null, contactName: text };
}

/**
 * Reads the date and number (or contact name) from Samsung and iPhone call-recording file names.
 * Times in names are local to the phone: `utcOffsetMinutes` converts them (default UTC).
 */
export function parseRecordingFileName(
  path: string,
  opts: { region?: CountryCode; utcOffsetMinutes?: number } = {},
): FileNameMeta | null {
  const region = opts.region ?? DEFAULT_PHONE_REGION;
  const offset = opts.utcOffsetMinutes ?? 0;
  const stem = baseName(path);

  const samsung = SAMSUNG.exec(stem.replace(SAMSUNG_PREFIX, ''));
  if (samsung) {
    const [, part, date, time] = samsung as unknown as [string, string, string, string];
    const y = date.length === 8 ? +date.slice(0, 4) : 2000 + +date.slice(0, 2);
    const md = date.slice(-4);
    const startedAt = utcIso(
      y,
      +md.slice(0, 2),
      +md.slice(2, 4),
      +time.slice(0, 2),
      +time.slice(2, 4),
      +time.slice(4, 6),
      offset,
    );
    if (startedAt) return { format: 'samsung', ...who(part, region), startedAt };
  }

  const prefixed = IPHONE_PREFIX.test(stem);
  const rest = stem.replace(IPHONE_PREFIX, '');
  const m = IPHONE_DATE.exec(rest);
  if (m) {
    const startedAt = utcIso(
      +m[1]!,
      +m[2]!,
      +m[3]!,
      +(m[4] ?? 0),
      +(m[5] ?? 0),
      +(m[6] ?? 0),
      offset,
    );
    const part = (rest.slice(0, m.index) + rest.slice(m.index + m[0].length)).trim();
    if (startedAt) return { format: 'iphone', ...who(part, region), startedAt };
  }
  if (prefixed && rest.trim()) {
    const w = who(rest, region);
    if (w.phone || w.contactName) return { format: 'iphone', ...w, startedAt: null };
  }
  return null;
}
