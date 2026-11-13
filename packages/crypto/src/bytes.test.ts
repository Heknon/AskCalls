import { createHash, hkdfSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  fromBase64Url,
  fromHex,
  i64be,
  randomBytes,
  randomInt,
  toBase64Url,
  toHex,
  u32be,
} from './bytes';
import { hkdfBytes, sha256, sha256Text } from './hash';

describe('byte helpers', () => {
  it('base64url round-trips every length and matches Buffer', () => {
    for (let n = 0; n < 40; n++) {
      const b = randomBytes(n);
      const s = toBase64Url(b);
      expect(s).toBe(Buffer.from(b).toString('base64url'));
      expect(fromBase64Url(s)).toEqual(b);
    }
    expect(() => fromBase64Url('a')).toThrow();
    expect(() => fromBase64Url('ab+/')).toThrow();
    expect(() => fromBase64Url('AB')).toThrow(); // non-zero trailing bits
  });

  it('hex round-trips', () => {
    const b = randomBytes(17);
    expect(fromHex(toHex(b))).toEqual(b);
    expect(() => fromHex('abc')).toThrow();
    expect(() => fromHex('zz')).toThrow();
  });

  it('encodes integers big-endian', () => {
    expect(toHex(u32be(0x01020304))).toBe('01020304');
    expect(toHex(i64be(-1n))).toBe('ffffffffffffffff');
    expect(() => u32be(-1)).toThrow();
    expect(() => i64be(1n << 63n)).toThrow();
  });

  it('randomInt stays in range', () => {
    for (let i = 0; i < 200; i++) {
      const n = randomInt(8);
      expect(n >= 0 && n < 8).toBe(true);
    }
    expect(() => randomInt(0)).toThrow();
  });

  it('randomBytes fills more than the 64 KiB getRandomValues limit', () => {
    const b = randomBytes(70_000);
    expect(b.subarray(66_000).some((x) => x !== 0)).toBe(true);
  });
});

describe('hashes', () => {
  it('sha256 and sha256Text match node:crypto', async () => {
    const b = randomBytes(100);
    expect(toHex(await sha256(b))).toBe(createHash('sha256').update(b).digest('hex'));
    expect(toHex(await sha256Text('héllo'))).toBe(
      createHash('sha256').update('héllo').digest('hex'),
    );
  });

  it('hkdfBytes matches RFC 5869 test case 1 and node:crypto', async () => {
    const ikm = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = fromHex('000102030405060708090a0b0c');
    const info = fromHex('f0f1f2f3f4f5f6f7f8f9');
    expect(toHex(await hkdfBytes(ikm, info, 42, salt))).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    );
    const key = randomBytes(32);
    expect(toHex(await hkdfBytes(key, 'askcalls/v1/kek'))).toBe(
      Buffer.from(hkdfSync('sha256', key, new Uint8Array(0), 'askcalls/v1/kek', 32)).toString(
        'hex',
      ),
    );
  });
});
