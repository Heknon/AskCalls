import { type CountryCode, DEFAULT_PHONE_REGION, parsePhone } from '@askcalls/indexing';
import { baseName } from './pairing';
import { fromZonedTime } from './time-zone';

export interface FileNameMeta {
  /** E.164 when the name holds a parsable number. */
  phone: string | null;
  /** The name part when it is not a number (the phone's contact name). */
  contactName: string | null;
  startedAt: string | null;
}

/** Recorder prefixes in English and Hebrew, stripped before reading the contact part. */
const PREFIX =
  /^(?:call[ _-]?recording|call[ _]with|call@|recording|הקלטת[ _]שיחה|שיחה[ _]עם|הקלטה)[ _\-–]*/i;

/** A bare `Call ` before the contact (Samsung in some languages); stripped, but not a sign on its own. */
const BARE_CALL = /^call[ _]+/i;

/** Bidi marks and zero-width characters recorders put around right-to-left names. */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * Date and time stamps, tried in order. Digits on either side end a match, so a stamp is never
 * cut out of a phone number.
 * - `YYYY-MM-DD[ at ]HH.MM[.SS]`, `YYYY-MM-DD_HHMM[SS]`, `YYYY_MM_DD_HH_MM_SS`, or the date alone.
 * - `YYYYMMDDHHMMSS`, `YYYYMMDD_HHMMSS`, `YYMMDD_HHMMSS`, optionally `.mmm` and a `+HHMM` offset.
 */
const SEPARATED =
  /(?<!\d)(\d{4})[-_.](\d{2})[-_.](\d{2})(?:[ _T]+(?:at[ _]+)?(?:(\d{1,2})[.:\-_](\d{2})(?:[.:\-_](\d{2}))?|(\d{2})(\d{2})(\d{2})?))?(?!\d)/i;
const COMPACT =
  /(?<![\d+])(?:(\d{8})[_-]?|(\d{6})[_-])(\d{6})(?:\.\d{1,3})?(?:([+-])(\d{2})(\d{2}))?(?!\d)/;

interface Stamp {
  index: number;
  length: number;
  startedAt: string;
}

/** `toInstant` turns the wall-clock fields, read as UTC, into the instant they name. */
function utcIso(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  toInstant: (wall: number) => number,
): string | null {
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  if (Number.isNaN(wall) || new Date(wall).getUTCDate() !== d) return null;
  return new Date(toInstant(wall)).toISOString();
}

function findStamp(text: string, timeZone: string): Stamp | null {
  const inZone = (wall: number) => fromZonedTime(wall, timeZone);
  const sep = SEPARATED.exec(text);
  if (sep) {
    const n = (i: number) => +(sep[i] ?? 0);
    const startedAt = utcIso(
      n(1),
      n(2),
      n(3),
      sep[4] ? n(4) : n(7),
      sep[5] ? n(5) : n(8),
      sep[6] ? n(6) : n(9),
      inZone,
    );
    if (startedAt) return { index: sep.index, length: sep[0].length, startedAt };
  }
  const c = COMPACT.exec(text);
  if (c) {
    const date = c[1] ?? c[2]!;
    const time = c[3]!;
    const y = date.length === 8 ? +date.slice(0, 4) : 2000 + +date.slice(0, 2);
    const md = date.slice(-4);
    const own = c[4] ? (c[4] === '-' ? -1 : 1) * (+c[5]! * 60 + +c[6]!) * 60_000 : null;
    const startedAt = utcIso(
      y,
      +md.slice(0, 2),
      +md.slice(2, 4),
      +time.slice(0, 2),
      +time.slice(2, 4),
      +time.slice(4, 6),
      own === null ? inZone : (wall) => wall - own,
    );
    if (startedAt) return { index: c.index, length: c[0].length, startedAt };
  }
  return null;
}

/** A run that could be a phone number: digits with `+`, spaces, brackets, dots or hyphens. */
const NUMBER_RUN = /\+?\(?\d[\d\s().-]{5,}\d\)?/;
/** Call direction words some recorders put in the name. */
const DIRECTION = /(?:^|\s)(?:in|out|incoming|outgoing)(?=\s|$)/gi;

function tidy(text: string): string {
  return text
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–()@,]+|[\s\-–()@,]+$/g, '');
}

function who(
  part: string,
  region: CountryCode,
): { phone: string | null; contactName: string | null } {
  const text = tidy(part.replace(/_+/g, ' ').replace(DIRECTION, ' '));
  const run = NUMBER_RUN.exec(text);
  const phone = run ? parsePhone(run[0], region) : null;
  const rest =
    phone && run ? tidy(text.slice(0, run.index) + text.slice(run.index + run[0].length)) : text;
  return { phone, contactName: rest || null };
}

/**
 * Reads the date and number or contact name from call-recording file names: Samsung
 * (`Call recording <who>_YYMMDD_HHMMSS`), iPhone exports (`Call with <who> YYYY-MM-DD at HH.MM`),
 * and Android recorders that put the stamp first, last or around `<name>(<number>)`.
 * Times in names are the phone's clock: they are read in `timeZone` (IANA, default UTC), unless
 * the name carries its own `+HHMM` offset.
 */
export function parseRecordingFileName(
  path: string,
  opts: { region?: CountryCode; timeZone?: string } = {},
): FileNameMeta | null {
  const region = opts.region ?? DEFAULT_PHONE_REGION;
  // Samsung appends `_1`, `_2` to repeated names.
  const stem = baseName(path)
    .replace(INVISIBLE, '')
    .replace(/(?<=\d{6})_\d{1,2}$/, '');
  const prefixed = PREFIX.test(stem);
  const rest = prefixed ? stem.replace(PREFIX, '') : stem.replace(BARE_CALL, '');
  const stamp = findStamp(rest, opts.timeZone ?? 'UTC');
  if (stamp) {
    const part = `${rest.slice(0, stamp.index)} ${rest.slice(stamp.index + stamp.length)}`;
    return { ...who(part, region), startedAt: stamp.startedAt };
  }
  if (prefixed && rest.trim()) {
    const w = who(rest, region);
    if (w.phone || w.contactName) return { ...w, startedAt: null };
  }
  return null;
}
