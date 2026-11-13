import { describe, expect, it } from 'vitest';
import { randomBytes } from './bytes';
import { isCryptoError } from './errors';
import { publicKeyFingerprint } from './fingerprint';
import {
  assertCallSignature,
  callSignatureMessage,
  exportSigningPrivateKey,
  generateSigningKeyPair,
  importSigningPrivateKey,
  signCall,
  verifyCall,
} from './signing';

const input = {
  callId: '0190b7e6-3c5a-7cc0-8000-000000000001',
  contentTok: -42n,
  transcriptPlaintext: '{"segments":[],"text":"hi"}',
};

describe('device signatures', () => {
  it('signs and verifies', async () => {
    const { publicKey, privateKey } = await generateSigningKeyPair();
    expect(privateKey.extractable).toBe(false);
    const sig = await signCall(privateKey, input);
    expect(sig.length).toBe(64);
    expect(await verifyCall(publicKey, input, sig)).toBe(true);
    await assertCallSignature(publicKey, input, sig);
  });

  it('fails for any change to call id, token, transcript, signature or key', async () => {
    const { publicKey, privateKey } = await generateSigningKeyPair();
    const other = await generateSigningKeyPair();
    const sig = await signCall(privateKey, input);
    expect(await verifyCall(publicKey, { ...input, callId: `${input.callId}x` }, sig)).toBe(false);
    expect(await verifyCall(publicKey, { ...input, contentTok: 42n }, sig)).toBe(false);
    expect(await verifyCall(publicKey, { ...input, transcriptPlaintext: '{}' }, sig)).toBe(false);
    expect(await verifyCall(other.publicKey, input, sig)).toBe(false);
    for (let i = 0; i < sig.length; i += 7) {
      const bad = new Uint8Array(sig);
      bad[i]! ^= 1;
      expect(await verifyCall(publicKey, input, bad)).toBe(false);
    }
    expect(await verifyCall(publicKey, input, sig.subarray(0, 63))).toBe(false);
    await expect(assertCallSignature(other.publicKey, input, sig)).rejects.toSatisfy((e) =>
      isCryptoError(e, 'bad_signature'),
    );
    await expect(verifyCall(randomBytes(10), input, sig)).rejects.toSatisfy((e) =>
      isCryptoError(e, 'invalid_format'),
    );
  });

  it('treats a string transcript as its UTF-8 bytes', async () => {
    expect(await callSignatureMessage(input)).toEqual(
      await callSignatureMessage({
        ...input,
        transcriptPlaintext: new TextEncoder().encode(input.transcriptPlaintext),
      }),
    );
  });

  it('exports and re-imports an extractable key (agent keychain)', async () => {
    const pair = await generateSigningKeyPair({ extractable: true });
    const pkcs8 = await exportSigningPrivateKey(pair.privateKey);
    const restored = await importSigningPrivateKey(pkcs8);
    expect(restored.extractable).toBe(false);
    expect(await verifyCall(pair.publicKey, input, await signCall(restored, input))).toBe(true);
    const locked = await generateSigningKeyPair();
    await expect(exportSigningPrivateKey(locked.privateKey)).rejects.toSatisfy((e) =>
      isCryptoError(e, 'invalid_input'),
    );
  });
});

describe('publicKeyFingerprint', () => {
  it('is six digits, stable, and differs between keys and link secrets', async () => {
    const a = await generateSigningKeyPair();
    const b = await generateSigningKeyPair();
    const fa = await publicKeyFingerprint(a.publicKey);
    expect(fa).toMatch(/^\d{6}$/);
    expect(await publicKeyFingerprint(a.publicKey)).toBe(fa);
    expect(await publicKeyFingerprint(b.publicKey)).not.toBe(fa);
    const secret = randomBytes(32);
    const keyed = await publicKeyFingerprint(a.publicKey, secret);
    expect(keyed).toMatch(/^\d{6}$/);
    expect(await publicKeyFingerprint(a.publicKey, secret)).toBe(keyed);
    expect(await publicKeyFingerprint(a.publicKey, randomBytes(32))).not.toBe(keyed);
    await expect(publicKeyFingerprint(a.publicKey, randomBytes(8))).rejects.toThrow();
  });
});
