import type { InboxSealer } from '@askcalls/domain/use-cases/inbox';

/**
 * Inbox sealing (spec 6.7): ECIES over P-256 with WebCrypto only, byte-compatible with
 * `encryptToInbox` in `@askcalls/crypto` so it can replace this file with no data change.
 *
 *   eph        = fresh ECDH P-256 key pair; ephPoint = its uncompressed point (65 bytes)
 *   shared     = ECDH(eph.private, recipient.public), x coordinate (32 bytes)
 *   key        = HKDF-SHA256(ikm = shared, salt = ephPoint, info = "askcalls/v1/ecies"), AES-256-GCM
 *   envelope   = 0x01 ‖ nonce (12) ‖ AES-GCM ciphertext ‖ tag (16)
 *   AAD        = u32be(len)‖userId ‖ u32be(0) (no callId) ‖ u32be(len)‖"inbox-item"  (inboxAad)
 *
 * The full ECIES blob is ephPoint ‖ envelope; InboxItem stores ephPoint in `ephemeralPublicKey`
 * and the envelope in `payloadCt` (or the blob). The recipient key may be SPKI or a raw point.
 */
export const ENVELOPE_VERSION = 1;
const INFO = new TextEncoder().encode('askcalls/v1/ecies');
const P256 = { name: 'ECDH', namedCurve: 'P-256' } as const;

const subtle = () => globalThis.crypto.subtle;
const buf = (b: Uint8Array) => b as Uint8Array<ArrayBuffer>;

function importPublic(key: Uint8Array): Promise<CryptoKey> {
  const raw = key.length === 65 && key[0] === 0x04;
  return subtle().importKey(raw ? 'raw' : 'spki', buf(key), P256, false, []);
}

async function deriveKey(
  shared: Uint8Array,
  ephPoint: Uint8Array,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> {
  const ikm = await subtle().importKey('raw', buf(shared), 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(ephPoint), info: INFO },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

export const sealToInbox: InboxSealer = async (recipientPublicKey, plaintext, aad) => {
  const recipient = await importPublic(recipientPublicKey);
  const eph = (await subtle().generateKey(P256, true, ['deriveBits'])) as CryptoKeyPair;
  const shared = new Uint8Array(
    await subtle().deriveBits({ name: 'ECDH', public: recipient }, eph.privateKey, 256),
  );
  const ephPoint = new Uint8Array(await subtle().exportKey('raw', eph.publicKey));
  try {
    const key = await deriveKey(shared, ephPoint, 'encrypt');
    const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(
      await subtle().encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: buf(aad) },
        key,
        buf(plaintext),
      ),
    );
    const envelope = new Uint8Array(1 + 12 + ct.length);
    envelope[0] = ENVELOPE_VERSION;
    envelope.set(nonce, 1);
    envelope.set(ct, 13);
    return { ephemeralPublicKey: ephPoint, ciphertext: envelope };
  } finally {
    shared.fill(0);
  }
};

/** The device side of `sealToInbox`. Throws on a wrong key, wrong AAD or tampering. */
export async function openInboxSeal(
  recipientPrivateKey: CryptoKey,
  ephPoint: Uint8Array,
  envelope: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  if (envelope[0] !== ENVELOPE_VERSION || envelope.length < 1 + 12 + 16) {
    throw new Error('unknown envelope version');
  }
  const eph = await importPublic(ephPoint);
  const shared = new Uint8Array(
    await subtle().deriveBits({ name: 'ECDH', public: eph }, recipientPrivateKey, 256),
  );
  try {
    const key = await deriveKey(shared, ephPoint, 'decrypt');
    return new Uint8Array(
      await subtle().decrypt(
        { name: 'AES-GCM', iv: buf(envelope.subarray(1, 13)), additionalData: buf(aad) },
        key,
        buf(envelope.subarray(13)),
      ),
    );
  } finally {
    shared.fill(0);
  }
}
