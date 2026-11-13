/**
 * Timecodes: `HH:MM:SS,mmm` (SRT), `HH:MM:SS.mmm` / `MM:SS.mmm` (VTT), `H:MM:SS`, `MM:SS`.
 * Returns seconds, or null when the string is not a timecode.
 */
const TIMECODE = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/;

export function parseTimecode(input: string): number | null {
  const m = TIMECODE.exec(input.trim());
  if (!m) return null;
  const hours = m[1] ? Number(m[1]) : 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  if (seconds >= 60 || (m[1] !== undefined && minutes >= 60)) return null;
  const fraction = m[4] ? Number(m[4].padEnd(3, '0')) / 1000 : 0;
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

function split(sec: number) {
  const totalMs = Math.max(0, Math.round(sec * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  return {
    h: Math.floor(totalSec / 3600),
    m: Math.floor((totalSec % 3600) / 60),
    s: totalSec % 60,
    ms,
  };
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** `HH:MM:SS,mmm` */
export function formatSrtTime(sec: number): string {
  const { h, m, s, ms } = split(sec);
  return `${p2(h)}:${p2(m)}:${p2(s)},${String(ms).padStart(3, '0')}`;
}

/** `HH:MM:SS`, rounding down to the second. */
export function formatClock(sec: number): string {
  const { h, m, s } = split(Math.floor(Math.max(0, sec)));
  return `${p2(h)}:${p2(m)}:${p2(s)}`;
}
