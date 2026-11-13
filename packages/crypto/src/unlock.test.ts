import { describe, expect, it } from 'vitest';
import { randomBytes } from './bytes';
import { isCryptoError } from './errors';
import { generateRootKey } from './keys';
import { ARGON2_DEFAULTS } from './passphrase';
import { generateRecoveryCode } from './recovery';
import {
  createDeviceEntry,
  createPasskeyEntry,
  createPassphraseEntry,
  createRecoveryEntry,
  generateDeviceSecret,
  passkeyWrapKey,
  unlockWithDeviceSecret,
  unlockWithPasskey,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
  unwrapRootKey,
  wrapRootKey,
} from './unlock';

const userId = 'user-42';
const FAST = { memoryKiB: 64, iterations: 1, parallelism: 1 };

/** kdfParams go through JSON in the database: make sure the entry survives that. */
const viaJson = <T>(v: T): Record<string, unknown> => JSON.parse(JSON.stringify(v));

const rejectsWith = (p: Promise<unknown>, reason: Parameters<typeof isCryptoError>[1]) =>
  expect(p).rejects.toSatisfy((e) => isCryptoError(e, reason));

describe('wrapRootKey / unwrapRootKey', () => {
  it('fails with wrong_key for another wrap key, user or kind', async () => {
    const rk = generateRootKey();
    const wrapKey = await passkeyWrapKey(randomBytes(32));
    const wrapped = await wrapRootKey(wrapKey, rk, { userId, kind: 'passkey' });
    expect(wrapped.length).toBe(61);
    expect(await unwrapRootKey(wrapKey, wrapped, { userId, kind: 'passkey' })).toEqual(rk);
    await rejectsWith(
      unwrapRootKey(await passkeyWrapKey(randomBytes(32)), wrapped, { userId, kind: 'passkey' }),
      'wrong_key',
    );
    await rejectsWith(
      unwrapRootKey(wrapKey, wrapped, { userId: 'x', kind: 'passkey' }),
      'wrong_key',
    );
    await rejectsWith(unwrapRootKey(wrapKey, wrapped, { userId, kind: 'device' }), 'wrong_key');
  });
});

describe('passkey (PRF)', () => {
  it('round-trips and rejects another PRF output', async () => {
    const rootKey = generateRootKey();
    const prfOutput = randomBytes(32);
    const entry = await createPasskeyEntry({ userId, rootKey, prfOutput });
    const stored = { wrappedRootKey: entry.wrappedRootKey, kdfParams: viaJson(entry.kdfParams) };
    expect(await unlockWithPasskey({ userId, prfOutput, ...stored })).toEqual(rootKey);
    await rejectsWith(
      unlockWithPasskey({ userId, prfOutput: randomBytes(32), ...stored }),
      'wrong_key',
    );
    await rejectsWith(
      unlockWithPasskey({ userId, prfOutput: randomBytes(16), ...stored }),
      'invalid_input',
    );
  });
});

describe('recovery code', () => {
  it('round-trips with a sloppily typed code and rejects another code', async () => {
    const rootKey = generateRootKey();
    const entry = await createRecoveryEntry({ userId, rootKey });
    const stored = { wrappedRootKey: entry.wrappedRootKey, kdfParams: viaJson(entry.kdfParams) };
    const typed = entry.code.toLowerCase().replaceAll('-', ' ').replaceAll('0', 'o');
    expect(await unlockWithRecoveryCode({ userId, code: typed, ...stored })).toEqual(rootKey);
    await rejectsWith(
      unlockWithRecoveryCode({ userId, code: generateRecoveryCode().code, ...stored }),
      'wrong_key',
    );
    await rejectsWith(
      unlockWithRecoveryCode({ userId, code: 'not a code', ...stored }),
      'invalid_recovery_code',
    );
  });

  it('rejects mismatched kdfParams', async () => {
    const entry = await createRecoveryEntry({ userId, rootKey: generateRootKey() });
    await rejectsWith(
      unlockWithRecoveryCode({
        userId,
        code: entry.code,
        wrappedRootKey: entry.wrappedRootKey,
        kdfParams: { v: 1, kdf: 'argon2id+hkdf', salt: 'AAAA' },
      }),
      'invalid_format',
    );
    await rejectsWith(
      unlockWithRecoveryCode({
        userId,
        code: entry.code,
        wrappedRootKey: entry.wrappedRootKey,
        kdfParams: { v: 1, kdf: 'hkdf', salt: 'AAAA' },
      }),
      'invalid_format',
    );
  });
});

describe('passphrase', () => {
  it('round-trips (small Argon2 params) and rejects a wrong passphrase', async () => {
    const rootKey = generateRootKey();
    const passphrase = 'a long enough passphrase';
    const entry = await createPassphraseEntry({ userId, rootKey, passphrase, argon2: FAST });
    expect(entry.kdfParams).toMatchObject({ v: 1, kdf: 'argon2id+hkdf', ...FAST });
    const stored = { wrappedRootKey: entry.wrappedRootKey, kdfParams: viaJson(entry.kdfParams) };
    expect(await unlockWithPassphrase({ userId, passphrase, ...stored })).toEqual(rootKey);
    await rejectsWith(
      unlockWithPassphrase({ userId, passphrase: 'a long enough passphrasE', ...stored }),
      'wrong_key',
    );
  });

  it('normalizes to NFC', async () => {
    const rootKey = generateRootKey();
    const composed = 'café café café';
    const decomposed = composed.normalize('NFD');
    expect(decomposed).not.toBe(composed);
    const entry = await createPassphraseEntry({
      userId,
      rootKey,
      passphrase: composed,
      argon2: FAST,
    });
    expect(
      await unlockWithPassphrase({
        userId,
        passphrase: decomposed,
        wrappedRootKey: entry.wrappedRootKey,
        kdfParams: viaJson(entry.kdfParams),
      }),
    ).toEqual(rootKey);
  });

  it('enforces the 12-character minimum', async () => {
    await rejectsWith(
      createPassphraseEntry({
        userId,
        rootKey: generateRootKey(),
        passphrase: 'elevenchars',
        argon2: FAST,
      }),
      'weak_passphrase',
    );
    // 12 code points, even though some are astral (2 UTF-16 units each).
    const entry = await createPassphraseEntry({
      userId,
      rootKey: generateRootKey(),
      passphrase: '😀😀😀😀😀😀abcdef',
      argon2: FAST,
    });
    expect(entry.wrappedRootKey.length).toBe(61);
  });

  it('rejects out-of-range stored Argon2 params', async () => {
    const entry = await createPassphraseEntry({
      userId,
      rootKey: generateRootKey(),
      passphrase: 'a long enough passphrase',
      argon2: FAST,
    });
    for (const patch of [
      { memoryKiB: 4 * 1024 * 1024 },
      { iterations: 0 },
      { parallelism: 0 },
      { memoryKiB: '64' },
    ]) {
      await rejectsWith(
        unlockWithPassphrase({
          userId,
          passphrase: 'a long enough passphrase',
          wrappedRootKey: entry.wrappedRootKey,
          kdfParams: { ...viaJson(entry.kdfParams), ...patch },
        }),
        'invalid_input',
      );
    }
  });

  it('uses the spec parameters by default (64 MiB, t=3, p=1)', async () => {
    expect(ARGON2_DEFAULTS).toEqual({ memoryKiB: 65536, iterations: 3, parallelism: 1 });
    const rootKey = generateRootKey();
    const passphrase = 'the real argon2 parameters';
    const entry = await createPassphraseEntry({ userId, rootKey, passphrase });
    expect(entry.kdfParams).toMatchObject({ memoryKiB: 65536, iterations: 3, parallelism: 1 });
    expect(
      await unlockWithPassphrase({
        userId,
        passphrase,
        wrappedRootKey: entry.wrappedRootKey,
        kdfParams: viaJson(entry.kdfParams),
      }),
    ).toEqual(rootKey);
  }, 30_000);
});

describe('device secret', () => {
  it('round-trips and rejects another secret', async () => {
    const rootKey = generateRootKey();
    const deviceSecret = generateDeviceSecret();
    const entry = await createDeviceEntry({ userId, rootKey, deviceSecret });
    const stored = { wrappedRootKey: entry.wrappedRootKey, kdfParams: viaJson(entry.kdfParams) };
    expect(await unlockWithDeviceSecret({ userId, deviceSecret, ...stored })).toEqual(rootKey);
    await rejectsWith(
      unlockWithDeviceSecret({ userId, deviceSecret: generateDeviceSecret(), ...stored }),
      'wrong_key',
    );
  });
});
