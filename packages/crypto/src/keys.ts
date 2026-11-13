import { AadFields, aad } from './aad';
import { decrypt, encrypt, importAesKey } from './aead';
import { buf, randomBytes, subtle, wipeBytes } from './bytes';
import { CryptoError } from './errors';
import { hkdfBytes } from './hash';

/** Spec 6.1. */
export const ROOT_KEY_LENGTH = 32;
export const DEK_LENGTH = 32;
export const KEK_INFO = 'askcalls/v1/kek';
export const INDEX_INFO = 'askcalls/v1/index';

/** 32 random bytes. Generated once per user, on the first device. */
export const generateRootKey = (): Uint8Array<ArrayBuffer> => randomBytes(ROOT_KEY_LENGTH);

function checkRootKey(rk: Uint8Array): void {
  if (rk.length !== ROOT_KEY_LENGTH)
    throw new CryptoError('invalid_input', 'root key must be 32 bytes');
}

/**
 * Raw subkey bytes: `HKDF-SHA256(ikm = RK, salt = empty, info = label, L = 32)`.
 * Exposed for test vectors; application code uses `UnlockedKeys`, which never keeps these bytes.
 */
export async function deriveSubkeyBytes(
  rk: Uint8Array,
): Promise<{ kek: Uint8Array<ArrayBuffer>; index: Uint8Array<ArrayBuffer> }> {
  checkRootKey(rk);
  const [kek, index] = await Promise.all([hkdfBytes(rk, KEK_INFO), hkdfBytes(rk, INDEX_INFO)]);
  return { kek, index };
}

/** Import 32 raw bytes as a non-extractable HMAC-SHA256 signing key. */
export function importHmacKey(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey('raw', buf(raw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/**
 * The keys of an unlocked session (spec 6.1, 6.8). KEK and index key are non-extractable
 * CryptoKeys. The raw RK is kept because adding an unlock method and linking a device need it;
 * `wipe()` zeroes it and drops every reference. After `wipe()` every getter throws `locked`.
 */
export class UnlockedKeys {
  #rootKey: Uint8Array | null;
  #kek: CryptoKey | null;
  #indexKey: CryptoKey | null;

  private constructor(rootKey: Uint8Array, kek: CryptoKey, indexKey: CryptoKey) {
    this.#rootKey = rootKey;
    this.#kek = kek;
    this.#indexKey = indexKey;
  }

  /** Derive the subkeys. The RK bytes are copied; the caller should wipe its own copy. */
  static async fromRootKey(rk: Uint8Array): Promise<UnlockedKeys> {
    const raw = await deriveSubkeyBytes(rk);
    try {
      const [kek, indexKey] = await Promise.all([importAesKey(raw.kek), importHmacKey(raw.index)]);
      return new UnlockedKeys(new Uint8Array(rk), kek, indexKey);
    } finally {
      wipeBytes(raw.kek);
      wipeBytes(raw.index);
    }
  }

  get locked(): boolean {
    return this.#rootKey === null;
  }

  /** The raw RK. Only for wrapping it under a new unlock method or ECIES to a new device. */
  get rootKey(): Uint8Array {
    if (!this.#rootKey) throw new CryptoError('locked', 'keys are locked');
    return this.#rootKey;
  }

  /** AES-256-GCM key: wraps DEKs; encrypts UserData, VocabDelta and the inbox private key. */
  get kek(): CryptoKey {
    if (!this.#kek) throw new CryptoError('locked', 'keys are locked');
    return this.#kek;
  }

  /** HMAC-SHA256 key for blind-index tokens. */
  get indexKey(): CryptoKey {
    if (!this.#indexKey) throw new CryptoError('locked', 'keys are locked');
    return this.#indexKey;
  }

  /** Zero the RK bytes and drop the CryptoKeys (WebCrypto keys cannot be zeroed, only released). */
  wipe(): void {
    if (this.#rootKey) wipeBytes(this.#rootKey);
    this.#rootKey = null;
    this.#kek = null;
    this.#indexKey = null;
  }
}

export interface CallContext {
  userId: string;
  callId: string;
}

/**
 * Create a per-call DEK (spec 6.1): 32 random bytes, returned as a non-extractable AES key plus
 * `wrappedDek = AEAD(KEK, DEK, aad(userId, callId, 'dek'))` (61 bytes). The raw bytes are wiped.
 */
export async function createDek(
  kek: CryptoKey,
  ctx: CallContext,
): Promise<{ dek: CryptoKey; wrappedDek: Uint8Array<ArrayBuffer> }> {
  const raw = randomBytes(DEK_LENGTH);
  try {
    const [dek, wrappedDek] = await Promise.all([
      importAesKey(raw),
      encrypt(kek, raw, aad({ ...ctx, field: AadFields.dek })),
    ]);
    return { dek, wrappedDek };
  } finally {
    wipeBytes(raw);
  }
}

/** Unwrap `Call.wrappedDek`. A different KEK, user or call id throws `decrypt_failed`. */
export async function unwrapDek(
  kek: CryptoKey,
  ctx: CallContext,
  wrappedDek: Uint8Array,
): Promise<CryptoKey> {
  const raw = await decrypt(kek, wrappedDek, aad({ ...ctx, field: AadFields.dek }));
  try {
    if (raw.length !== DEK_LENGTH) throw new CryptoError('invalid_format', 'DEK must be 32 bytes');
    return await importAesKey(raw);
  } finally {
    wipeBytes(raw);
  }
}
