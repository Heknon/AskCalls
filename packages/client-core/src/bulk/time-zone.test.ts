import { describe, expect, it } from 'vitest';
import { fromZonedTime, isTimeZone, timeZones } from './time-zone';

const at = (wall: string, timeZone: string) => {
  const [y, mo, d, h, mi] = wall.split(/[- :]/).map(Number) as number[];
  return new Date(fromZonedTime(Date.UTC(y!, mo! - 1, d!, h, mi), timeZone)).toISOString();
};

describe('fromZonedTime', () => {
  it('uses the offset in effect on the date, not today', () => {
    expect(at('2026-01-15 14:00', 'Asia/Jerusalem')).toBe('2026-01-15T12:00:00.000Z');
    expect(at('2026-07-15 14:00', 'Asia/Jerusalem')).toBe('2026-07-15T11:00:00.000Z');
    expect(at('2026-11-14 10:00', 'Pacific/Kiritimati')).toBe('2026-11-13T20:00:00.000Z');
    expect(at('2026-11-14 10:00', 'UTC')).toBe('2026-11-14T10:00:00.000Z');
  });

  it('moves a time the clocks skip past the change', () => {
    expect(at('2026-03-08 02:30', 'America/New_York')).toBe('2026-03-08T07:30:00.000Z');
    expect(at('2026-03-27 02:30', 'Asia/Jerusalem')).toBe('2026-03-27T00:30:00.000Z');
  });

  it('takes the earlier of a time the clocks repeat', () => {
    expect(at('2026-11-01 01:30', 'America/New_York')).toBe('2026-11-01T05:30:00.000Z');
    expect(at('2026-10-25 01:30', 'Asia/Jerusalem')).toBe('2026-10-24T22:30:00.000Z');
  });
});

describe('time zone names', () => {
  it('accepts IANA zones only', () => {
    expect(isTimeZone('Asia/Jerusalem')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
    expect(isTimeZone('')).toBe(false);
    expect(isTimeZone(undefined)).toBe(false);
  });

  it('lists the current zone and UTC once, in order', () => {
    const zones = timeZones('Asia/Calcutta');
    expect(zones).toContain('Asia/Calcutta');
    expect(zones.filter((z) => z === 'UTC')).toHaveLength(1);
    expect(zones).toEqual([...zones].sort());
  });
});
