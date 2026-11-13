import { describe, expect, it } from 'vitest';
import { AadFields, aad } from './aad';
import { AEAD_OVERHEAD, decrypt, decryptJson, encrypt, encryptJson, importAesKey } from './aead';
import { concat, randomBytes, utf8 } from './bytes';
import { CryptoError, isCryptoError } from './errors';

const ctx = { userId: 'u1', callId: 'c1' };

async function expectReason(p: Promise<unknown>, reason: string) {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(CryptoError);
  expect((e as CryptoError).reason).toBe(reason);
}

describe('AEAD envelope', () => {
  it('round-trips and has the documented layout', async () => {
    const key = await importAesKey(randomBytes(32));
    const ad = aad({ ...ctx, field: AadFields.transcript });
    const pt = utf8('hello');
    const ct = await encrypt(key, pt, ad);
    expect(ct.length).toBe(pt.length + AEAD_OVERHEAD);
    expect(ct[0]).toBe(1);
    expect(await decrypt(key, ct, ad)).toEqual(pt);
  });

  it('uses a fresh nonce every time', async () => {
    const key = await importAesKey(randomBytes(32));
    const ad = aad({ ...ctx, field: 'meta' });
    const a = await encrypt(key, utf8('same'), ad);
    const b = await encrypt(key, utf8('same'), ad);
    expect(a).not.toEqual(b);
  });

  it('detects every single-byte modification', async () => {
    const key = await importAesKey(randomBytes(32));
    const ad = aad({ ...ctx, field: AadFields.meta });
    const ct = await encrypt(key, utf8('tamper me please'), ad);
    for (let i = 0; i < ct.length; i++) {
      const bad = new Uint8Array(ct);
      bad[i]! ^= 0x01;
      const reason = i === 0 ? 'invalid_format' : 'decrypt_failed';
      await expectReason(decrypt(key, bad, ad), reason);
    }
  });

  it('rejects truncation and extension', async () => {
    const key = await importAesKey(randomBytes(32));
    const ad = aad({ ...ctx, field: AadFields.meta });
    const ct = await encrypt(key, utf8('x'.repeat(40)), ad);
    await expectReason(decrypt(key, ct.subarray(0, ct.length - 1), ad), 'decrypt_failed');
    await expectReason(decrypt(key, concat(ct, Uint8Array.of(0)), ad), 'decrypt_failed');
    await expectReason(decrypt(key, ct.subarray(0, AEAD_OVERHEAD - 1), ad), 'invalid_format');
  });

  it('fails with the wrong key', async () => {
    const ad = aad({ ...ctx, field: AadFields.meta });
    const ct = await encrypt(await importAesKey(randomBytes(32)), utf8('secret'), ad);
    await expectReason(decrypt(await importAesKey(randomBytes(32)), ct, ad), 'decrypt_failed');
  });

  it('fails when any AAD component differs', async () => {
    const key = await importAesKey(randomBytes(32));
    const ad = aad({ ...ctx, field: AadFields.snippet(3) });
    const ct = await encrypt(key, utf8('snippet'), ad);
    for (const other of [
      aad({ userId: 'u2', callId: 'c1', field: AadFields.snippet(3) }),
      aad({ userId: 'u1', callId: 'c2', field: AadFields.snippet(3) }),
      aad({ userId: 'u1', callId: 'c1', field: AadFields.snippet(4) }),
      aad({ userId: 'u1', callId: 'c1', field: AadFields.transcript }),
    ]) {
      await expectReason(decrypt(key, ct, other), 'decrypt_failed');
    }
  });

  it('round-trips JSON', async () => {
    const key = await importAesKey(randomBytes(32));
    const ad = aad({ ...ctx, field: AadFields.meta });
    const meta = { phoneE164: '+972501234567', direction: 'in', durationSec: 61, notes: 'שלום' };
    expect(await decryptJson(key, await encryptJson(key, meta, ad), ad)).toEqual(meta);
    const notJson = await encrypt(key, utf8('{oops'), ad);
    await expectReason(decryptJson(key, notJson, ad), 'invalid_format');
  });

  it('rejects keys of the wrong size', async () => {
    await expect(importAesKey(randomBytes(16))).rejects.toSatisfy((e) =>
      isCryptoError(e, 'invalid_input'),
    );
  });
});

describe('aad()', () => {
  it('is injective across field boundaries', () => {
    const a = aad({ userId: 'ab', callId: 'c', field: 'f' });
    const b = aad({ userId: 'a', callId: 'bc', field: 'f' });
    expect(a).not.toEqual(b);
    expect(aad({ userId: 'u', field: 'x' })).toEqual(aad({ userId: 'u', callId: '', field: 'x' }));
  });

  it('builds field names', () => {
    expect(AadFields.snippet(0)).toBe('snippet:0');
    expect(AadFields.userData('tags')).toBe('userdata:tags');
    expect(AadFields.vocabDelta(7)).toBe('vocab:7');
    expect(AadFields.rootKey('passkey')).toBe('rootkey:passkey');
    expect(() => AadFields.snippet(-1)).toThrow(CryptoError);
    expect(() => AadFields.snippet(1.5)).toThrow(CryptoError);
  });

  it('requires a user id and a field', () => {
    expect(() => aad({ userId: '', field: 'meta' })).toThrow(CryptoError);
    expect(() => aad({ userId: 'u', field: '' })).toThrow(CryptoError);
  });
});
