import { buf, concat, fromUtf8, randomBytes, subtle, utf8 } from './bytes';
import { CryptoError } from './errors';

/**
 * AES-256-GCM envelope (spec 6.3): `version(1) ‖ nonce(12) ‖ ciphertext ‖ tag(16)`.
 * Version 0x01 = AES-256-GCM, random 96-bit nonce, 128-bit tag. Every `*Ct` column uses it.
 */
export const AEAD_VERSION = 0x01;
export const NONCE_LENGTH = 12;
export const TAG_LENGTH = 16;
/** Bytes added to the plaintext length: version + nonce + tag. */
export const AEAD_OVERHEAD = 1 + NONCE_LENGTH + TAG_LENGTH;

/** Import 32 raw bytes as a non-extractable AES-256-GCM key. */
export async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== 32) throw new CryptoError('invalid_input', 'AES key must be 32 bytes');
  return subtle().importKey('raw', buf(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Raw AES-GCM with an explicit nonce. Internal building block; callers never choose nonces. */
export async function gcmSeal(
  key: CryptoKey,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await subtle().encrypt(
      { name: 'AES-GCM', iv: buf(nonce), additionalData: buf(additionalData), tagLength: 128 },
      key,
      buf(plaintext),
    ),
  );
}

export async function gcmOpen(
  key: CryptoKey,
  nonce: Uint8Array,
  sealed: Uint8Array,
  additionalData: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return new Uint8Array(
      await subtle().decrypt(
        { name: 'AES-GCM', iv: buf(nonce), additionalData: buf(additionalData), tagLength: 128 },
        key,
        buf(sealed),
      ),
    );
  } catch {
    throw new CryptoError('decrypt_failed', 'authentication failed');
  }
}

/**
 * Deterministic variant for test vectors only. Reusing a nonce under one key breaks AES-GCM;
 * production code calls `encrypt`, which draws a random nonce.
 */
export async function encryptWithNonce(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  if (nonce.length !== NONCE_LENGTH)
    throw new CryptoError('invalid_input', 'nonce must be 12 bytes');
  const sealed = await gcmSeal(key, nonce, plaintext, aad);
  return concat(Uint8Array.of(AEAD_VERSION), nonce, sealed);
}

/** Encrypt bytes into the versioned envelope with a fresh random nonce. */
export const encrypt = (
  key: CryptoKey,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> =>
  encryptWithNonce(key, plaintext, aad, randomBytes(NONCE_LENGTH));

/** Decrypt the versioned envelope. Wrong key, wrong AAD or any modified byte throws `decrypt_failed`. */
export async function decrypt(
  key: CryptoKey,
  envelope: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  if (envelope.length < AEAD_OVERHEAD)
    throw new CryptoError('invalid_format', 'ciphertext too short');
  if (envelope[0] !== AEAD_VERSION) throw new CryptoError('invalid_format', 'unknown version');
  return gcmOpen(
    key,
    envelope.subarray(1, 1 + NONCE_LENGTH),
    envelope.subarray(1 + NONCE_LENGTH),
    aad,
  );
}

/** Encrypt `JSON.stringify(value)` as UTF-8. */
export const encryptJson = (key: CryptoKey, value: unknown, aad: Uint8Array) =>
  encrypt(key, utf8(JSON.stringify(value)), aad);

/** Decrypt and `JSON.parse`. Validate the result with the domain's zod schema at the call site. */
export async function decryptJson<T = unknown>(
  key: CryptoKey,
  envelope: Uint8Array,
  aad: Uint8Array,
): Promise<T> {
  const text = fromUtf8(await decrypt(key, envelope, aad));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new CryptoError('invalid_format', 'invalid json');
  }
}
