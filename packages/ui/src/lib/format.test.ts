import { describe, expect, test } from 'vitest';
import { formatPhone } from './format';

describe('formatPhone', () => {
  test.each([
    ['+972525550134', '+972 52-555-0134'],
    ['+97235551234', '+972 3-555-1234'],
    ['+442079460958', '+44 20 7946 0958'],
    ['+12025550123', '+1 202 555 0123'],
    ['+33142685300', '+33 1 42 68 53 00'],
    ['+4930123456', '+49 30 123456'],
  ])('international %s', (e164, expected) => {
    expect(formatPhone(e164)).toBe(expected);
  });

  test.each([
    ['+972525550134', '052-555-0134'],
    ['+442079460958', '020 7946 0958'],
  ])('national %s', (e164, expected) => {
    expect(formatPhone(e164, 'national')).toBe(expected);
  });

  test('returns unparseable input unchanged', () => {
    expect(formatPhone('private')).toBe('private');
  });
});
