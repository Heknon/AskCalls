import { describe, expect, it } from 'vitest';
import { randomBytes } from './bytes';
import { isCryptoError } from './errors';
import { argon2idBytes, checkArgon2Params, estimatePassphraseStrength } from './passphrase';

describe('estimatePassphraseStrength', () => {
  it('flags short passphrases as unacceptable', () => {
    const s = estimatePassphraseStrength('Short1!');
    expect(s.acceptable).toBe(false);
    expect(s.warnings).toContain('too_short');
    expect(s.score).toBeLessThanOrEqual(1);
  });

  it('scores repeats, runs and common words low', () => {
    expect(estimatePassphraseStrength('aaaaaaaaaaaaaaaa').score).toBe(0);
    expect(estimatePassphraseStrength('aaaaaaaaaaaaaaaa').warnings).toContain('repeated');
    expect(estimatePassphraseStrength('abcdefghijklmnop').warnings).toContain('sequence');
    expect(estimatePassphraseStrength('password12345678').warnings).toContain('common');
    expect(estimatePassphraseStrength('password12345678').score).toBeLessThanOrEqual(1);
  });

  it('scores long mixed passphrases high', () => {
    const s = estimatePassphraseStrength('Tangerine-Orbit-Quiet-7-Harbor');
    expect(s.acceptable).toBe(true);
    expect(s.score).toBe(4);
    expect(s.warnings).toEqual([]);
  });

  it('is monotone-ish in length for random text', () => {
    const a = estimatePassphraseStrength('kq7Vz2mX9wLp');
    const b = estimatePassphraseStrength('kq7Vz2mX9wLpR4tY8nB3');
    expect(b.bits).toBeGreaterThan(a.bits);
  });

  it('handles non-Latin scripts', () => {
    const s = estimatePassphraseStrength('שלום עולם יפה מאוד');
    expect(s.acceptable).toBe(true);
    expect(s.score).toBeGreaterThanOrEqual(3);
  });
});

describe('argon2idBytes', () => {
  it('is deterministic and depends on salt and params', async () => {
    const salt = randomBytes(16);
    const p = { memoryKiB: 64, iterations: 1, parallelism: 1 };
    const a = await argon2idBytes('passphrase', salt, p);
    expect(a.length).toBe(32);
    expect(await argon2idBytes('passphrase', salt, p)).toEqual(a);
    expect(await argon2idBytes('passphrase', randomBytes(16), p)).not.toEqual(a);
    expect(await argon2idBytes('passphrase', salt, { ...p, iterations: 2 })).not.toEqual(a);
  });

  it('validates salt and params', async () => {
    await expect(
      argon2idBytes('x', randomBytes(8), { memoryKiB: 64, iterations: 1, parallelism: 1 }),
    ).rejects.toSatisfy((e) => isCryptoError(e, 'invalid_input'));
    expect(() => checkArgon2Params({ memoryKiB: 7, iterations: 1, parallelism: 1 })).toThrow();
    expect(() => checkArgon2Params({ memoryKiB: 64, iterations: 1.5, parallelism: 1 })).toThrow();
  });
});
