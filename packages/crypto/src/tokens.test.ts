import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { randomBytes, utf8 } from './bytes';
import { sha256Text } from './hash';
import { importHmacKey } from './keys';
import { contentToken, type TokenKind, token, tokenSet, tokens } from './tokens';

const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;

describe('blind-index tokens', () => {
  it('matches an independent HMAC computation', async () => {
    const raw = randomBytes(32);
    const key = await importHmacKey(raw);
    for (const [kind, value] of [
      ['w', 'meeting'],
      ['c', '+15551234567'],
      ['t', 'tag-1'],
    ] as const) {
      const mac = createHmac('sha256', raw)
        .update(Buffer.concat([Buffer.from(kind), Buffer.of(0), Buffer.from(value)]))
        .digest();
      expect(await token(key, kind, value)).toBe(mac.readBigInt64BE(0));
    }
  });

  it('is stable and stays inside int64, including negative values', async () => {
    const key = await importHmacKey(randomBytes(32));
    const values = Array.from({ length: 200 }, (_, i) => `word${i}`);
    const first = await tokens(key, 'w', values);
    expect(await tokens(key, 'w', values)).toEqual(first);
    expect(first.some((t) => t < 0n)).toBe(true);
    expect(first.some((t) => t > 0n)).toBe(true);
    for (const t of first) {
      expect(t >= INT64_MIN && t <= INT64_MAX).toBe(true);
    }
  });

  it('separates kinds and keys', async () => {
    const key = await importHmacKey(randomBytes(32));
    const other = await importHmacKey(randomBytes(32));
    const kinds: TokenKind[] = ['w', 'c', 't', 'a', 'x'];
    const all = await Promise.all(kinds.map((k) => token(key, k, 'same')));
    expect(new Set(all).size).toBe(kinds.length);
    expect(await token(other, 'w', 'same')).not.toBe(await token(key, 'w', 'same'));
  });

  it('treats a string as its UTF-8 bytes', async () => {
    const key = await importHmacKey(randomBytes(32));
    expect(await token(key, 'w', 'שלום')).toBe(await token(key, 'w', utf8('שלום')));
  });

  it('rejects unknown kinds', async () => {
    const key = await importHmacKey(randomBytes(32));
    await expect(token(key, 'z' as TokenKind, 'v')).rejects.toThrow();
  });

  it('tokenSet dedupes and sorts', async () => {
    const key = await importHmacKey(randomBytes(32));
    const set = await tokenSet(key, 'w', ['b', 'a', 'b', 'c', 'a']);
    expect(set.length).toBe(3);
    expect([...set].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))).toEqual(set);
    expect(new Set(set)).toEqual(new Set(await tokens(key, 'w', ['a', 'b', 'c'])));
  });

  it('contentToken hashes the normalized text first', async () => {
    const key = await importHmacKey(randomBytes(32));
    expect(await contentToken(key, 'hello world')).toBe(
      await token(key, 'x', await sha256Text('hello world')),
    );
  });
});
