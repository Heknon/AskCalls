import { describe, expect, it } from 'vitest';
import { AadFields, aad } from './aad';
import { randomBytes, utf8 } from './bytes';
import {
  decryptInboxItem,
  decryptRootKeyFromLink,
  eciesDecrypt,
  eciesEncrypt,
  encryptRootKeyForDevice,
  encryptToInbox,
  generateEcdhKeyPair,
  generateInboxKeyPair,
  joinEcies,
  openInboxPrivateKey,
  splitEcies,
} from './ecies';
import { isCryptoError } from './errors';
import { generateRootKey, UnlockedKeys } from './keys';

const userId = 'u1';
const ad = aad({ userId, field: AadFields.inboxItem });
const rejects = (p: Promise<unknown>, reason: Parameters<typeof isCryptoError>[1]) =>
  expect(p).rejects.toSatisfy((e) => isCryptoError(e, reason));

describe('ECIES', () => {
  it('round-trips, with the documented layout', async () => {
    const { publicKey, privateKey } = await generateEcdhKeyPair();
    expect(privateKey.extractable).toBe(false);
    const pt = randomBytes(1000);
    const ct = await eciesEncrypt(publicKey, pt, ad);
    expect(ct.length).toBe(65 + 1 + 12 + pt.length + 16);
    expect(ct[0]).toBe(0x04);
    expect(ct[65]).toBe(0x01);
    expect(await eciesDecrypt(privateKey, ct, ad)).toEqual(pt);
    const { ephemeralPublicKey, payload } = splitEcies(ct);
    expect(ephemeralPublicKey.length).toBe(65);
    expect(joinEcies(ephemeralPublicKey, payload)).toEqual(ct);
  });

  it('uses a new ephemeral key per message', async () => {
    const { publicKey } = await generateEcdhKeyPair();
    const a = splitEcies(await eciesEncrypt(publicKey, utf8('x'), ad));
    const b = splitEcies(await eciesEncrypt(publicKey, utf8('x'), ad));
    expect(a.ephemeralPublicKey).not.toEqual(b.ephemeralPublicKey);
  });

  it('fails for another recipient, AAD or any modified byte', async () => {
    const { publicKey, privateKey } = await generateEcdhKeyPair();
    const other = await generateEcdhKeyPair();
    const ct = await eciesEncrypt(publicKey, utf8('payload'), ad);
    await rejects(eciesDecrypt(other.privateKey, ct, ad), 'decrypt_failed');
    await rejects(
      eciesDecrypt(privateKey, ct, aad({ userId: 'u2', field: 'inbox-item' })),
      'decrypt_failed',
    );
    for (let i = 1; i < ct.length; i++) {
      const bad = new Uint8Array(ct);
      bad[i]! ^= 0x80;
      await expect(eciesDecrypt(privateKey, bad, ad)).rejects.toSatisfy(
        (e) => isCryptoError(e, 'decrypt_failed') || isCryptoError(e, 'invalid_format'),
      );
    }
    await rejects(eciesDecrypt(privateKey, ct.subarray(0, 60), ad), 'invalid_format');
  });

  it('rejects a malformed recipient key', async () => {
    await rejects(eciesEncrypt(randomBytes(91), utf8('x'), ad), 'invalid_format');
  });
});

describe('inbox key pair', () => {
  it('stores the private key under the KEK and decrypts inbox items', async () => {
    const keys = await UnlockedKeys.fromRootKey(generateRootKey());
    const inbox = await generateInboxKeyPair(keys.kek, userId);
    expect(inbox.privateKey.extractable).toBe(false);

    const item = await encryptToInbox(inbox.publicKey, userId, utf8('{"text":"call"}'));
    const reopened = await openInboxPrivateKey(keys.kek, userId, inbox.privateKeyCt);
    expect(new TextDecoder().decode(await decryptInboxItem(reopened, userId, item))).toBe(
      '{"text":"call"}',
    );
    await rejects(decryptInboxItem(reopened, 'u2', item), 'decrypt_failed');

    const otherKeys = await UnlockedKeys.fromRootKey(generateRootKey());
    await rejects(openInboxPrivateKey(otherKeys.kek, userId, inbox.privateKeyCt), 'decrypt_failed');
    await rejects(openInboxPrivateKey(keys.kek, 'u2', inbox.privateKeyCt), 'decrypt_failed');
  });
});

describe('device link', () => {
  it('sends the root key to the joining device', async () => {
    const rk = generateRootKey();
    const joiner = await generateEcdhKeyPair();
    const ct = await encryptRootKeyForDevice(joiner.publicKey, userId, rk);
    expect(await decryptRootKeyFromLink(joiner.privateKey, userId, ct)).toEqual(rk);
    // An inbox item can't be replayed as a device-link payload (different AAD field).
    const asInbox = await encryptToInbox(joiner.publicKey, userId, rk);
    await rejects(decryptRootKeyFromLink(joiner.privateKey, userId, asInbox), 'decrypt_failed');
  });
});
