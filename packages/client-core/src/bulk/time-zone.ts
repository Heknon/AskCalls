/** The IANA time zone of this device ("Asia/Jerusalem"). */
export const deviceTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const clocks = new Map<string, Intl.DateTimeFormat>();

/** Milliseconds `timeZone` is ahead of UTC at the instant `ms`. */
function offsetAt(ms: number, timeZone: string): number {
  let clock = clocks.get(timeZone);
  if (!clock) {
    clock = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    clocks.set(timeZone, clock);
  }
  const part = Object.fromEntries(clock.formatToParts(ms).map((p) => [p.type, Number(p.value)]));
  const wall = Date.UTC(
    part.year!,
    part.month! - 1,
    part.day!,
    part.hour,
    part.minute,
    part.second,
  );
  return wall - Math.floor(ms / 1000) * 1000;
}

const DAY_MS = 86_400_000;

/**
 * The instant a wall-clock time in `timeZone` names, with the offset in effect on that date.
 * `wall` is the clock's fields read as UTC (`Date.UTC(y, m, d, h, mi, s)`). A time repeated when
 * the clocks go back takes the earlier instant; one skipped when they go forward is read with the
 * offset from before the change, so it lands after it.
 */
export function fromZonedTime(wall: number, timeZone: string): number {
  const before = offsetAt(wall - DAY_MS, timeZone);
  const after = offsetAt(wall + DAY_MS, timeZone);
  const fits = [wall - before, wall - after].filter((t) => offsetAt(t, timeZone) === wall - t);
  return fits.length ? Math.min(...fits) : wall - before;
}

/** Every zone this device knows, with UTC and `current` among them, in order. */
export function timeZones(current: string): string[] {
  return [...new Set([...Intl.supportedValuesOf('timeZone'), 'UTC', current])].sort();
}
