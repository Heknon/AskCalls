import { describe, expect, it } from 'vitest';
import { AadFields, aad } from './aad';
import { decrypt, encrypt } from './aead';
import { utf8 } from './bytes';
import { isCryptoError } from './errors';
import { createDek, generateRootKey, UnlockedKeys, unwrapDek } from './keys';

describe('key hierarchy', () => {
  it('generates distinct 32-byte root keys', () => {
    const a = generateRootKey();
    const b = generateRootKey();
    expect(a.length).toBe(32);
    expect(a).not.toEqual(b);
  });

  it('derives non-extractable subkeys and copies the root key', async () => {
    const rk = generateRootKey();
    const keys = await UnlockedKeys.fromRootKey(rk);
    expect(keys.kek.extractable).toBe(false);
    expect(keys.indexKey.extractable).toBe(false);
    expect(keys.kek.algorithm.name).toBe('AES-GCM');
    expect(keys.indexKey.algorithm.name).toBe('HMAC');
    expect(keys.rootKey).toEqual(rk);
    expect(keys.rootKey).not.toBe(rk);
  });

  it('wipe() zeroes the root key and locks every getter', async () => {
    const keys = await UnlockedKeys.fromRootKey(generateRootKey());
    const held = keys.rootKey;
    keys.wipe();
    expect(keys.locked).toBe(true);
    expect(held.every((b) => b === 0)).toBe(true);
    for (const get of [() => keys.rootKey, () => keys.kek, () => keys.indexKey]) {
      expect(get).toThrow(expect.objectContaining({ reason: 'locked' }));
    }
    keys.wipe();
  });

  it('rejects root keys of the wrong length', async () => {
    await expect(UnlockedKeys.fromRootKey(new Uint8Array(16))).rejects.toSatisfy((e) =>
      isCryptoError(e, 'invalid_input'),
    );
  });
});

describe('per-call DEK', () => {
  const ctx = { userId: 'u1', callId: 'call-1' };

  it('wraps and unwraps', async () => {
    const keys = await UnlockedKeys.fromRootKey(generateRootKey());
    const { dek, wrappedDek } = await createDek(keys.kek, ctx);
    expect(dek.extractable).toBe(false);
    expect(wrappedDek.length).toBe(61);
    const ad = aad({ ...ctx, field: AadFields.transcript });
    const ct = await encrypt(dek, utf8('transcript'), ad);
    const unwrapped = await unwrapDek(keys.kek, ctx, wrappedDek);
    expect(new TextDecoder().decode(await decrypt(unwrapped, ct, ad))).toBe('transcript');
  });

  it('fails to unwrap for another call, user or KEK', async () => {
    const keys = await UnlockedKeys.fromRootKey(generateRootKey());
    const other = await UnlockedKeys.fromRootKey(generateRootKey());
    const { wrappedDek } = await createDek(keys.kek, ctx);
    // Each attempt starts when it is awaited: a rejection started earlier would go unhandled
    // while the one before it is awaited.
    for (const attempt of [
      () => unwrapDek(keys.kek, { ...ctx, callId: 'call-2' }, wrappedDek),
      () => unwrapDek(keys.kek, { ...ctx, userId: 'u2' }, wrappedDek),
      () => unwrapDek(other.kek, ctx, wrappedDek),
    ]) {
      await expect(attempt()).rejects.toSatisfy((e) => isCryptoError(e, 'decrypt_failed'));
    }
  });
});
