import { eciesDecrypt, eciesEncrypt, joinEcies, splitEcies } from '@askcalls/crypto';
import type { InboxSealer } from '@askcalls/domain/use-cases/inbox';

/**
 * Inbox sealing (spec 6.7) with `@askcalls/crypto` ECIES, the same bytes `encryptToInbox`
 * produces: the domain hands over `inboxAad(userId)`, which equals the crypto package's
 * `aad({ userId, field: 'inbox-item' })`. InboxItem keeps the 65-byte ephemeral point in
 * `ephemeralPublicKey` and the AEAD envelope in `payloadCt` (or the blob).
 */
export const sealToInbox: InboxSealer = async (recipientPublicKey, plaintext, aad) => {
  const { ephemeralPublicKey, payload } = splitEcies(
    await eciesEncrypt(recipientPublicKey, plaintext, aad),
  );
  return { ephemeralPublicKey, ciphertext: payload };
};

/** The device side of `sealToInbox`. Throws on a wrong key, wrong AAD or tampering. */
export const openInboxSeal = (
  recipientPrivateKey: CryptoKey,
  ephPoint: Uint8Array,
  envelope: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> => eciesDecrypt(recipientPrivateKey, joinEcies(ephPoint, envelope), aad);
