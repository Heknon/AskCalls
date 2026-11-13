import { describe, expect, it } from 'vitest';
import vectors from '../test/vectors.json';
import { AadFields, aad } from './aad';
import { decrypt, encryptWithNonce, importAesKey } from './aead';
import { fromHex, toHex, utf8 } from './bytes';
import { decryptRootKeyFromLink } from './ecies';
import { publicKeyFingerprint } from './fingerprint';
import { sha256 } from './hash';
import { deriveSubkeyBytes, importHmacKey, UnlockedKeys, unwrapDek } from './keys';
import { argon2idBytes } from './passphrase';
import { decryptRecording, encryptRecording } from './recording';
import { formatRecoveryCode, parseRecoveryCode } from './recovery';
import { callSignatureMessage, verifyCall } from './signing';
import { contentToken, type TokenKind, token } from './tokens';
import {
  PRF_SALT,
  unlockWithDeviceSecret,
  unlockWithPasskey,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
} from './unlock';

// Known-answer tests against test/vectors.json, which test/generate-vectors.ts computes with
// node:crypto, independently of this package.

const { userId, callId } = vectors;
const rootKeyHex = vectors.hierarchy.rootKey;

describe('test vectors', () => {
  it('derives the KEK and index key from the root key', async () => {
    const raw = await deriveSubkeyBytes(fromHex(rootKeyHex));
    expect(toHex(raw.kek)).toBe(vectors.hierarchy.kek);
    expect(toHex(raw.index)).toBe(vectors.hierarchy.indexKey);
  });

  it('encodes AAD', () => {
    expect(toHex(aad({ userId, callId, field: AadFields.transcript }))).toBe(
      vectors.aad.transcript,
    );
    expect(toHex(aad({ userId, callId, field: AadFields.dek }))).toBe(vectors.aad.dek);
    expect(toHex(aad({ userId, field: AadFields.inboxPrivateKey }))).toBe(
      vectors.aad.inboxPrivateKey,
    );
  });

  it('produces and opens the AEAD envelope', async () => {
    const key = await importAesKey(fromHex(vectors.aead.key));
    const ct = await encryptWithNonce(
      key,
      utf8(vectors.aead.plaintextUtf8),
      fromHex(vectors.aead.aad),
      fromHex(vectors.aead.nonce),
    );
    expect(toHex(ct)).toBe(vectors.aead.envelope);
    const pt = await decrypt(key, fromHex(vectors.aead.envelope), fromHex(vectors.aead.aad));
    expect(new TextDecoder().decode(pt)).toBe(vectors.aead.plaintextUtf8);
  });

  it('unwraps the DEK and decrypts the transcript with it', async () => {
    const keys = await UnlockedKeys.fromRootKey(fromHex(rootKeyHex));
    const dek = await unwrapDek(keys.kek, { userId, callId }, fromHex(vectors.dek.wrappedDek));
    const pt = await decrypt(
      dek,
      fromHex(vectors.aead.envelope),
      aad({ userId, callId, field: AadFields.transcript }),
    );
    expect(new TextDecoder().decode(pt)).toBe(vectors.aead.plaintextUtf8);
  });

  it('computes tokens', async () => {
    const indexKey = await importHmacKey(fromHex(vectors.hierarchy.indexKey));
    for (const v of vectors.tokens) {
      const value = 'valueHex' in v && v.valueHex ? fromHex(v.valueHex) : (v.value as string);
      expect(await token(indexKey, v.kind as TokenKind, value)).toBe(BigInt(v.token));
    }
    expect(await contentToken(indexKey, vectors.contentToken.normalizedText)).toBe(
      BigInt(vectors.contentToken.token),
    );
  });

  it('has the PRF salt', async () => {
    expect(toHex(PRF_SALT)).toBe(vectors.prfSalt);
    expect(toHex(await sha256(utf8('askcalls/v1/prf')))).toBe(vectors.prfSalt);
  });

  it('formats and parses the recovery code', () => {
    expect(formatRecoveryCode(fromHex(vectors.recovery.bytes))).toBe(vectors.recovery.code);
    expect(toHex(parseRecoveryCode(vectors.recovery.code))).toBe(vectors.recovery.bytes);
  });

  it('unlocks each method', async () => {
    const rk = await unlockWithRecoveryCode({
      userId,
      code: vectors.recovery.code,
      wrappedRootKey: fromHex(vectors.recovery.wrappedRootKey),
      kdfParams: vectors.recovery.kdfParams,
    });
    expect(toHex(rk)).toBe(rootKeyHex);

    const rk2 = await unlockWithPasskey({
      userId,
      prfOutput: fromHex(vectors.passkey.prfOutput),
      wrappedRootKey: fromHex(vectors.passkey.wrappedRootKey),
      kdfParams: vectors.passkey.kdfParams,
    });
    expect(toHex(rk2)).toBe(rootKeyHex);

    const rk3 = await unlockWithPassphrase({
      userId,
      passphrase: vectors.passphrase.passphrase,
      wrappedRootKey: fromHex(vectors.passphrase.wrappedRootKey),
      kdfParams: vectors.passphrase.kdfParams,
    });
    expect(toHex(rk3)).toBe(rootKeyHex);

    const rk4 = await unlockWithDeviceSecret({
      userId,
      deviceSecret: fromHex(vectors.device.deviceSecret),
      wrappedRootKey: fromHex(vectors.device.wrappedRootKey),
      kdfParams: vectors.device.kdfParams,
    });
    expect(toHex(rk4)).toBe(rootKeyHex);
  });

  it('computes Argon2id', async () => {
    const { salt, memoryKiB, iterations, parallelism } = vectors.passphrase.kdfParams;
    const out = await argon2idBytes(
      vectors.passphrase.passphrase,
      Uint8Array.from(Buffer.from(salt, 'base64url')),
      { memoryKiB, iterations, parallelism },
    );
    expect(toHex(out)).toBe(vectors.passphrase.argon2id);
  });

  it('decrypts the device-link ECIES vector', async () => {
    const priv = await crypto.subtle.importKey(
      'pkcs8',
      fromHex(vectors.ecies.recipientPkcs8),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
    const rk = await decryptRootKeyFromLink(
      priv,
      userId,
      fromHex(vectors.ecies.deviceLinkCiphertext),
    );
    expect(toHex(rk)).toBe(rootKeyHex);
  });

  it('builds the signature message and verifies the signature', async () => {
    const input = {
      callId,
      contentTok: BigInt(vectors.signing.contentTok),
      transcriptPlaintext: vectors.signing.transcriptPlaintextUtf8,
    };
    expect(toHex(await callSignatureMessage(input))).toBe(vectors.signing.message);
    expect(
      await verifyCall(
        fromHex(vectors.signing.publicKeySpki),
        input,
        fromHex(vectors.signing.signature),
      ),
    ).toBe(true);
  });

  it('computes fingerprints', async () => {
    const spki = fromHex(vectors.fingerprint.spki);
    expect(await publicKeyFingerprint(spki)).toBe(vectors.fingerprint.unkeyed);
    expect(await publicKeyFingerprint(spki, fromHex(vectors.fingerprint.linkSecret))).toBe(
      vectors.fingerprint.keyed,
    );
  });

  it('produces and opens the segmented recording', async () => {
    const r = vectors.recording;
    const dek = await importAesKey(fromHex(r.dek));
    const ct = await encryptRecording(dek, utf8(r.plaintextUtf8), fromHex(r.baseAad), {
      segmentSize: r.segmentSize,
      noncePrefix: fromHex(r.noncePrefix),
    });
    expect(toHex(ct)).toBe(r.ciphertext);
    const pt = await decryptRecording(dek, fromHex(r.ciphertext), fromHex(r.baseAad));
    expect(new TextDecoder().decode(pt)).toBe(r.plaintextUtf8);
    expect(toHex(aad({ userId, callId, field: AadFields.recording }))).toBe(r.baseAad);
  });
});
