import { describe, expect, test } from 'vitest';
import { formatDate, formatTime, formatWhen } from './dates';

describe('dates and times', () => {
  const at = new Date(2026, 10, 14, 0, 15);

  test('a 24-hour clock and the regional date order in every UI locale', () => {
    expect(formatTime(at, 'en-GB')).toBe('00:15');
    expect(formatTime(at, 'he-IL')).toBe('00:15');
    expect(formatDate(at, 'en-GB')).toBe('14 Nov 2026');
    expect(formatWhen(at, 'en-GB', new Date(2026, 10, 14, 9))).toBe('Today, 00:15');
  });
});
