import { AadFields, aad } from './aad';
import { decrypt, encrypt, importAesKey } from './aead';
import { fromBase64Url, fromHex, randomBytes, toBase64Url, wipeBytes } from './bytes';
import { CryptoError, isCryptoError } from './errors';
import { hkdfBytes } from './hash';
import { ROOT_KEY_LENGTH } from './keys';
import {
  ARGON2_DEFAULTS,
  ARGON2_SALT_LENGTH,
  type Argon2Params,
  argon2idBytes,
  assertPassphraseLength,
  checkArgon2Params,
} from './passphrase';
import { generateRecoveryCode, parseRecoveryCode } from './recovery';

/**
 * Unlock methods (spec 6.2). Each `Keyring` row stores
 * `wrappedRootKey = AEAD(wrapKey, RK, aad(userId, '', 'rootkey:<kind>'))` and `kdfParams`, the
 * public inputs needed to re-derive `wrapKey`.
 *
 * | kind       | wrapKey                                                               |
 * | ---------- | --------------------------------------------------------------------- |
 * | passkey    | HKDF(ikm = PRF output, salt = ∅, info = askcalls/v1/wrap/passkey)       |
 * | recovery   | HKDF(ikm = 20 code bytes, salt = kdfParams.salt, info = …/recovery)   |
 * | passphrase | HKDF(ikm = Argon2id(pass, salt), salt = ∅, info = …/passphrase)       |
 * | device     | HKDF(ikm = 32-byte local secret, salt = kdfParams.salt, info = …/device)|
 */
export type UnlockKind = 'passkey' | 'recovery' | 'passphrase' | 'device';

export const WRAP_INFO: Record<UnlockKind, string> = {
  passkey: 'askcalls/v1/wrap/passkey',
  recovery: 'askcalls/v1/wrap/recovery',
  passphrase: 'askcalls/v1/wrap/passphrase',
  device: 'askcalls/v1/wrap/device',
};

/** `sha256("askcalls/v1/prf")`: the salt passed to the WebAuthn PRF extension's `eval.first`. */
export const PRF_SALT = fromHex('1da109c90a689195d33906f5390dae122cc0985ebb82c70b30db76241544be63');

export interface PasskeyKdfParams {
  v: 1;
  kdf: 'webauthn-prf+hkdf';
  /** base64url of the PRF salt (always PRF_SALT in v1). */
  prfSalt: string;
  /** WebAuthn transports the credential reported; not used by the KDF. */
  transports?: string[];
}
export interface RecoveryKdfParams {
  v: 1;
  kdf: 'hkdf';
  salt: string;
}
export interface PassphraseKdfParams {
  v: 1;
  kdf: 'argon2id+hkdf';
  salt: string;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}
export interface DeviceKdfParams {
  v: 1;
  kdf: 'device-secret+hkdf';
  salt: string;
}
export type KdfParams =
  | PasskeyKdfParams
  | RecoveryKdfParams
  | PassphraseKdfParams
  | DeviceKdfParams;

/** What a new `Keyring` row needs from crypto. */
export interface WrappedRootKey<P extends KdfParams = KdfParams> {
  wrappedRootKey: Uint8Array<ArrayBuffer>;
  kdfParams: P;
}

const SALT_LENGTH = 16;
const PRF_OUTPUT_LENGTH = 32;
const DEVICE_SECRET_LENGTH = 32;

async function wrapKeyFrom(
  ikm: Uint8Array,
  kind: UnlockKind,
  salt?: Uint8Array,
): Promise<CryptoKey> {
  const raw = await hkdfBytes(ikm, WRAP_INFO[kind], 32, salt);
  try {
    return await importAesKey(raw);
  } finally {
    wipeBytes(raw);
  }
}

/** `AEAD(wrapKey, RK, aad(userId, '', 'rootkey:<kind>'))`: 61 bytes. */
export function wrapRootKey(
  wrapKey: CryptoKey,
  rootKey: Uint8Array,
  ctx: { userId: string; kind: UnlockKind },
): Promise<Uint8Array<ArrayBuffer>> {
  if (rootKey.length !== ROOT_KEY_LENGTH) {
    throw new CryptoError('invalid_input', 'root key must be 32 bytes');
  }
  return encrypt(wrapKey, rootKey, aad({ userId: ctx.userId, field: AadFields.rootKey(ctx.kind) }));
}

/** Inverse of `wrapRootKey`. Any authentication failure is reported as `wrong_key`. */
export async function unwrapRootKey(
  wrapKey: CryptoKey,
  wrapped: Uint8Array,
  ctx: { userId: string; kind: UnlockKind },
): Promise<Uint8Array<ArrayBuffer>> {
  let rk: Uint8Array<ArrayBuffer>;
  try {
    rk = await decrypt(
      wrapKey,
      wrapped,
      aad({ userId: ctx.userId, field: AadFields.rootKey(ctx.kind) }),
    );
  } catch (e) {
    if (isCryptoError(e, 'decrypt_failed')) throw new CryptoError('wrong_key', 'unlock failed');
    throw e;
  }
  if (rk.length !== ROOT_KEY_LENGTH) throw new CryptoError('invalid_format', 'root key length');
  return rk;
}

function field(params: Record<string, unknown>, name: string): unknown {
  return params[name];
}

function expect(params: Record<string, unknown>, kdf: string): void {
  if (field(params, 'v') !== 1 || field(params, 'kdf') !== kdf) {
    throw new CryptoError('invalid_format', 'unexpected kdfParams');
  }
}

function saltFrom(
  params: Record<string, unknown>,
  name = 'salt',
  length = SALT_LENGTH,
): Uint8Array {
  const value = field(params, name);
  if (typeof value !== 'string') throw new CryptoError('invalid_format', 'kdfParams salt missing');
  const salt = fromBase64Url(value);
  if (salt.length !== length) throw new CryptoError('invalid_format', 'kdfParams salt length');
  return salt;
}

// ---- Passkey (WebAuthn PRF) ----------------------------------------------------------------

/** wrapKey from the 32-byte PRF output of `evaluate(PRF_SALT)`. */
export function passkeyWrapKey(prfOutput: Uint8Array): Promise<CryptoKey> {
  if (prfOutput.length !== PRF_OUTPUT_LENGTH) {
    throw new CryptoError('invalid_input', 'PRF output must be 32 bytes');
  }
  return wrapKeyFrom(prfOutput, 'passkey');
}

export async function createPasskeyEntry(input: {
  userId: string;
  rootKey: Uint8Array;
  prfOutput: Uint8Array;
}): Promise<WrappedRootKey<PasskeyKdfParams>> {
  const wrapKey = await passkeyWrapKey(input.prfOutput);
  return {
    wrappedRootKey: await wrapRootKey(wrapKey, input.rootKey, {
      userId: input.userId,
      kind: 'passkey',
    }),
    kdfParams: { v: 1, kdf: 'webauthn-prf+hkdf', prfSalt: toBase64Url(PRF_SALT) },
  };
}

export async function unlockWithPasskey(input: {
  userId: string;
  prfOutput: Uint8Array;
  wrappedRootKey: Uint8Array;
  kdfParams: Record<string, unknown>;
}): Promise<Uint8Array<ArrayBuffer>> {
  expect(input.kdfParams, 'webauthn-prf+hkdf');
  const wrapKey = await passkeyWrapKey(input.prfOutput);
  return unwrapRootKey(wrapKey, input.wrappedRootKey, { userId: input.userId, kind: 'passkey' });
}

// ---- Recovery code ---------------------------------------------------------------------------

export async function recoveryWrapKey(codeBytes: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  return wrapKeyFrom(codeBytes, 'recovery', salt);
}

/** New recovery entry. `code` is the formatted string to show once; it is not stored anywhere. */
export async function createRecoveryEntry(input: {
  userId: string;
  rootKey: Uint8Array;
}): Promise<WrappedRootKey<RecoveryKdfParams> & { code: string }> {
  const { bytes, code } = generateRecoveryCode();
  const salt = randomBytes(SALT_LENGTH);
  try {
    const wrapKey = await recoveryWrapKey(bytes, salt);
    return {
      code,
      wrappedRootKey: await wrapRootKey(wrapKey, input.rootKey, {
        userId: input.userId,
        kind: 'recovery',
      }),
      kdfParams: { v: 1, kdf: 'hkdf', salt: toBase64Url(salt) },
    };
  } finally {
    wipeBytes(bytes);
  }
}

/** Unlock with a typed code. Unparseable input: `invalid_recovery_code`; wrong code: `wrong_key`. */
export async function unlockWithRecoveryCode(input: {
  userId: string;
  code: string;
  wrappedRootKey: Uint8Array;
  kdfParams: Record<string, unknown>;
}): Promise<Uint8Array<ArrayBuffer>> {
  expect(input.kdfParams, 'hkdf');
  const bytes = parseRecoveryCode(input.code);
  try {
    const wrapKey = await recoveryWrapKey(bytes, saltFrom(input.kdfParams));
    return await unwrapRootKey(wrapKey, input.wrappedRootKey, {
      userId: input.userId,
      kind: 'recovery',
    });
  } finally {
    wipeBytes(bytes);
  }
}

// ---- Passphrase ------------------------------------------------------------------------------

export async function passphraseWrapKey(
  passphrase: string,
  salt: Uint8Array,
  params: Argon2Params,
): Promise<CryptoKey> {
  const stretched = await argon2idBytes(passphrase, salt, params);
  try {
    return await wrapKeyFrom(stretched, 'passphrase');
  } finally {
    wipeBytes(stretched);
  }
}

/** New passphrase entry. Enforces the 12-character minimum (`weak_passphrase`). */
export async function createPassphraseEntry(input: {
  userId: string;
  rootKey: Uint8Array;
  passphrase: string;
  /** Defaults to ARGON2_DEFAULTS (64 MiB, t = 3, p = 1). Lower only in tests. */
  argon2?: Argon2Params;
}): Promise<WrappedRootKey<PassphraseKdfParams>> {
  assertPassphraseLength(input.passphrase);
  const params = checkArgon2Params(input.argon2 ?? ARGON2_DEFAULTS);
  const salt = randomBytes(ARGON2_SALT_LENGTH);
  const wrapKey = await passphraseWrapKey(input.passphrase, salt, params);
  return {
    wrappedRootKey: await wrapRootKey(wrapKey, input.rootKey, {
      userId: input.userId,
      kind: 'passphrase',
    }),
    kdfParams: { v: 1, kdf: 'argon2id+hkdf', salt: toBase64Url(salt), ...params },
  };
}

export async function unlockWithPassphrase(input: {
  userId: string;
  passphrase: string;
  wrappedRootKey: Uint8Array;
  kdfParams: Record<string, unknown>;
}): Promise<Uint8Array<ArrayBuffer>> {
  expect(input.kdfParams, 'argon2id+hkdf');
  const p = input.kdfParams;
  const params = checkArgon2Params({
    memoryKiB: field(p, 'memoryKiB') as number,
    iterations: field(p, 'iterations') as number,
    parallelism: field(p, 'parallelism') as number,
  });
  const wrapKey = await passphraseWrapKey(
    input.passphrase,
    saltFrom(p, 'salt', ARGON2_SALT_LENGTH),
    params,
  );
  return unwrapRootKey(wrapKey, input.wrappedRootKey, { userId: input.userId, kind: 'passphrase' });
}

// ---- Device (local secret: OS keychain for the agent) ----------------------------------------

export function generateDeviceSecret(): Uint8Array<ArrayBuffer> {
  return randomBytes(DEVICE_SECRET_LENGTH);
}

export function deviceWrapKey(secret: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  if (secret.length !== DEVICE_SECRET_LENGTH) {
    throw new CryptoError('invalid_input', 'device secret must be 32 bytes');
  }
  return wrapKeyFrom(secret, 'device', salt);
}

export async function createDeviceEntry(input: {
  userId: string;
  rootKey: Uint8Array;
  deviceSecret: Uint8Array;
}): Promise<WrappedRootKey<DeviceKdfParams>> {
  const salt = randomBytes(SALT_LENGTH);
  const wrapKey = await deviceWrapKey(input.deviceSecret, salt);
  return {
    wrappedRootKey: await wrapRootKey(wrapKey, input.rootKey, {
      userId: input.userId,
      kind: 'device',
    }),
    kdfParams: { v: 1, kdf: 'device-secret+hkdf', salt: toBase64Url(salt) },
  };
}

export async function unlockWithDeviceSecret(input: {
  userId: string;
  deviceSecret: Uint8Array;
  wrappedRootKey: Uint8Array;
  kdfParams: Record<string, unknown>;
}): Promise<Uint8Array<ArrayBuffer>> {
  expect(input.kdfParams, 'device-secret+hkdf');
  const wrapKey = await deviceWrapKey(input.deviceSecret, saltFrom(input.kdfParams));
  return unwrapRootKey(wrapKey, input.wrappedRootKey, { userId: input.userId, kind: 'device' });
}
