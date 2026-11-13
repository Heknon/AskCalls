import {
  AadFields,
  aad,
  decryptInboxItem,
  encryptToInbox,
  generateInboxKeyPair,
  importAesKey,
  joinEcies,
  randomBytes,
  splitEcies,
} from '@askcalls/crypto';
import { inboxAad } from '@askcalls/domain/use-cases/inbox';
import { describe, expect, it } from 'vitest';
import { openInboxSeal, sealToInbox } from './inbox-seal';

describe('inbox sealing uses the @askcalls/crypto format', () => {
  it('builds the same AAD as the crypto package', () => {
    expect(inboxAad('user-1')).toEqual(aad({ userId: 'user-1', field: AadFields.inboxItem }));
  });

  it('round-trips with encryptToInbox and decryptInboxItem in both directions', async () => {
    const kek = await importAesKey(randomBytes(32));
    const pair = await generateInboxKeyPair(kek, 'user-1');
    const plaintext = new TextEncoder().encode('sealed payload');

    const sealed = await sealToInbox(pair.publicKey, plaintext, inboxAad('user-1'));
    expect(sealed.ephemeralPublicKey).toHaveLength(65);
    expect(sealed.ciphertext[0]).toBe(1);
    const viaCrypto = await decryptInboxItem(
      pair.privateKey,
      'user-1',
      joinEcies(sealed.ephemeralPublicKey, sealed.ciphertext),
    );
    expect(viaCrypto).toEqual(plaintext);

    const { ephemeralPublicKey, payload } = splitEcies(
      await encryptToInbox(pair.publicKey, 'user-1', plaintext),
    );
    expect(
      await openInboxSeal(pair.privateKey, ephemeralPublicKey, payload, inboxAad('user-1')),
    ).toEqual(plaintext);
    await expect(
      openInboxSeal(pair.privateKey, ephemeralPublicKey, payload, inboxAad('user-2')),
    ).rejects.toThrow();
  });
});
