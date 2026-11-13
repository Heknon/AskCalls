import { describe, expect, it } from 'vitest';
import { buildPath } from './route';
import { fromB64, fromTok, toB64, toTok } from './wire';

describe('wire encodings', () => {
  it('round-trips bytes through base64', () => {
    const b = crypto.getRandomValues(new Uint8Array(100_000));
    expect(fromB64(toB64(b))).toEqual(b);
  });
  it('round-trips signed 64-bit tokens', () => {
    for (const t of [0n, -1n, 9223372036854775807n, -9223372036854775808n]) {
      expect(fromTok(toTok(t))).toBe(t);
    }
  });
  it('builds paths', () => {
    expect(buildPath('/api/calls/:id', { id: 'a b' })).toBe('/api/calls/a%20b');
  });
});
