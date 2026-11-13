import { AadFields, aad } from './aad';
import { decrypt, encrypt, importAesKey } from './aead';
import { buf, concat, subtle, wipeBytes } from './bytes';
import { CryptoError } from './errors';
import { hkdfBytes } from './hash';
import { ROOT_KEY_LENGTH } from './keys';

/**
 * ECIES over P-256 (spec 6.5, 6.7).
 *
 * Ciphertext: `ephemeralPublicKey(65, uncompressed SEC1 point) ‖ envelope`, where `envelope` is the
 * standard AEAD envelope `version ‖ nonce ‖ ct ‖ tag` under
 * `HKDF-SHA256(ikm = ECDH(eph, recipient).x, salt = ephemeralPublicKey, info = "askcalls/v1/ecies")`.
 * The caller's AAD goes to AES-GCM unchanged.
 */
export const ECIES_INFO = 'askcalls/v1/ecies';
export const P256_POINT_LENGTH = 65;

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;

export interface EcdhKeyPair {
  /** SPKI bytes, for the server (`UserKeys.inboxPublicKey`, `DeviceLinkSession.devicePublicKey`). */
  publicKey: Uint8Array<ArrayBuffer>;
  /** Non-extractable private key (usage `deriveBits`). */
  privateKey: CryptoKey;
}

/** A fresh ECDH P-256 key pair with a non-extractable private key (device-link joiner). */
export async function generateEcdhKeyPair(): Promise<EcdhKeyPair> {
  const pair = (await subtle().generateKey(ECDH, false, ['deriveBits'])) as CryptoKeyPair;
  return {
    publicKey: new Uint8Array(await subtle().exportKey('spki', pair.publicKey)),
    privateKey: pair.privateKey,
  };
}

async function importEcdhPublic(format: 'spki' | 'raw', bytes: Uint8Array): Promise<CryptoKey> {
  try {
    return await subtle().importKey(format, buf(bytes), ECDH, true, []);
  } catch {
    throw new CryptoError('invalid_format', 'invalid P-256 public key');
  }
}

async function sharedKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  ephemeralRaw: Uint8Array,
): Promise<CryptoKey> {
  let shared: Uint8Array | undefined;
  let okm: Uint8Array | undefined;
  try {
    shared = new Uint8Array(
      await subtle().deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256),
    );
    okm = await hkdfBytes(shared, ECIES_INFO, 32, ephemeralRaw);
    return await importAesKey(okm);
  } finally {
    if (shared) wipeBytes(shared);
    if (okm) wipeBytes(okm);
  }
}

/** Encrypt to a P-256 public key given as SPKI bytes. */
export async function eciesEncrypt(
  recipientPublicKey: Uint8Array,
  plaintext: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const recipient = await importEcdhPublic('spki', recipientPublicKey);
  const eph = (await subtle().generateKey(ECDH, false, ['deriveBits'])) as CryptoKeyPair;
  const ephRaw = new Uint8Array(await subtle().exportKey('raw', eph.publicKey));
  const key = await sharedKey(eph.privateKey, recipient, ephRaw);
  return concat(ephRaw, await encrypt(key, plaintext, additionalData));
}

/** Split into the ephemeral public key (raw, 65 bytes) and the AEAD envelope, e.g. for `InboxItem`. */
export function splitEcies(ciphertext: Uint8Array): {
  ephemeralPublicKey: Uint8Array;
  payload: Uint8Array;
} {
  if (ciphertext.length <= P256_POINT_LENGTH || ciphertext[0] !== 0x04) {
    throw new CryptoError('invalid_format', 'invalid ECIES ciphertext');
  }
  return {
    ephemeralPublicKey: ciphertext.subarray(0, P256_POINT_LENGTH),
    payload: ciphertext.subarray(P256_POINT_LENGTH),
  };
}

export const joinEcies = (ephemeralPublicKey: Uint8Array, payload: Uint8Array) =>
  concat(ephemeralPublicKey, payload);

/** Decrypt with the recipient's private key. Wrong key, AAD or any modified byte: `decrypt_failed`. */
export async function eciesDecrypt(
  privateKey: CryptoKey,
  ciphertext: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const { ephemeralPublicKey, payload } = splitEcies(ciphertext);
  let eph: CryptoKey;
  try {
    eph = await importEcdhPublic('raw', ephemeralPublicKey);
  } catch {
    throw new CryptoError('decrypt_failed', 'authentication failed');
  }
  const key = await sharedKey(privateKey, eph, ephemeralPublicKey);
  return decrypt(key, payload, additionalData);
}

// ---- Inbox key pair (spec 6.1, 6.7) ---------------------------------------------------------

export interface InboxKeyPair extends EcdhKeyPair {
  /** `UserKeys.inboxPrivateKeyCt`: AEAD(KEK, PKCS#8, aad(userId, '', 'inbox-private-key')). */
  privateKeyCt: Uint8Array<ArrayBuffer>;
}

/** Generate the inbox key pair; the PKCS#8 private key is encrypted with the KEK and wiped. */
export async function generateInboxKeyPair(kek: CryptoKey, userId: string): Promise<InboxKeyPair> {
  const pair = (await subtle().generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey));
  try {
    const [publicKey, privateKeyCt, privateKey] = await Promise.all([
      subtle()
        .exportKey('spki', pair.publicKey)
        .then((b) => new Uint8Array(b)),
      encrypt(kek, pkcs8, aad({ userId, field: AadFields.inboxPrivateKey })),
      subtle().importKey('pkcs8', pkcs8, ECDH, false, ['deriveBits']),
    ]);
    return { publicKey, privateKeyCt, privateKey };
  } finally {
    wipeBytes(pkcs8);
  }
}

/** Decrypt `UserKeys.inboxPrivateKeyCt` into a non-extractable private key. */
export async function openInboxPrivateKey(
  kek: CryptoKey,
  userId: string,
  privateKeyCt: Uint8Array,
): Promise<CryptoKey> {
  const pkcs8 = await decrypt(kek, privateKeyCt, aad({ userId, field: AadFields.inboxPrivateKey }));
  try {
    return await subtle().importKey('pkcs8', pkcs8, ECDH, false, ['deriveBits']);
  } catch {
    throw new CryptoError('invalid_format', 'invalid inbox private key');
  } finally {
    wipeBytes(pkcs8);
  }
}

/** Server side of the inbox: encrypt a received payload to the user's inbox public key. */
export const encryptToInbox = (inboxPublicKey: Uint8Array, userId: string, payload: Uint8Array) =>
  eciesEncrypt(inboxPublicKey, payload, aad({ userId, field: AadFields.inboxItem }));

export const decryptInboxItem = (
  inboxPrivateKey: CryptoKey,
  userId: string,
  ciphertext: Uint8Array,
) => eciesDecrypt(inboxPrivateKey, ciphertext, aad({ userId, field: AadFields.inboxItem }));

// ---- Device link (spec 6.5) -----------------------------------------------------------------

/** Trusted device: `DeviceLinkSession.encryptedRootKey = ECIES(devicePublicKey, RK)`. */
export function encryptRootKeyForDevice(
  devicePublicKey: Uint8Array,
  userId: string,
  rootKey: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  if (rootKey.length !== ROOT_KEY_LENGTH) {
    throw new CryptoError('invalid_input', 'root key must be 32 bytes');
  }
  return eciesEncrypt(devicePublicKey, rootKey, aad({ userId, field: AadFields.deviceLink }));
}

/** Joining device: recover RK with its ephemeral private key. */
export async function decryptRootKeyFromLink(
  devicePrivateKey: CryptoKey,
  userId: string,
  encryptedRootKey: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const rk = await eciesDecrypt(
    devicePrivateKey,
    encryptedRootKey,
    aad({ userId, field: AadFields.deviceLink }),
  );
  if (rk.length !== ROOT_KEY_LENGTH) throw new CryptoError('invalid_format', 'root key length');
  return rk;
}
