import { buf, concat, i64be, lengthPrefixed, subtle, utf8 } from './bytes';
import { CryptoError } from './errors';
import { sha256 } from './hash';

/**
 * Device signatures (spec 6.6). ECDSA P-256 with SHA-256; signatures are IEEE P1363 `r ‖ s`
 * (64 bytes), which is what WebCrypto produces.
 *
 * Signed message, 32 bytes:
 * `sha256( u32be(len(callId)) ‖ utf8(callId) ‖ i64be(contentTok) ‖ sha256(transcriptPlaintext) )`
 * where `transcriptPlaintext` is the exact byte string encrypted into `Call.transcriptCt`
 * (a string argument is taken as its UTF-8 bytes).
 */
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;
export const SIGNATURE_LENGTH = 64;

export interface SigningKeyPair {
  /** SPKI bytes for `DeviceKey.signingPublicKey`. */
  publicKey: Uint8Array<ArrayBuffer>;
  privateKey: CryptoKey;
}

/**
 * New device signing key. Browsers keep the non-extractable CryptoKey (e.g. in IndexedDB);
 * the agent passes `extractable: true` to store PKCS#8 in the OS keychain.
 */
export async function generateSigningKeyPair(
  options: { extractable?: boolean } = {},
): Promise<SigningKeyPair> {
  const pair = (await subtle().generateKey(ECDSA, options.extractable ?? false, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return {
    publicKey: new Uint8Array(await subtle().exportKey('spki', pair.publicKey)),
    privateKey: pair.privateKey,
  };
}

/** PKCS#8 bytes of an extractable signing key. */
export async function exportSigningPrivateKey(
  privateKey: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!privateKey.extractable) throw new CryptoError('invalid_input', 'key is not extractable');
  return new Uint8Array(await subtle().exportKey('pkcs8', privateKey));
}

/** Import PKCS#8 as a non-extractable signing key. */
export async function importSigningPrivateKey(pkcs8: Uint8Array): Promise<CryptoKey> {
  try {
    return await subtle().importKey('pkcs8', buf(pkcs8), ECDSA, false, ['sign']);
  } catch {
    throw new CryptoError('invalid_format', 'invalid signing key');
  }
}

async function importSigningPublicKey(spki: Uint8Array): Promise<CryptoKey> {
  try {
    return await subtle().importKey('spki', buf(spki), ECDSA, false, ['verify']);
  } catch {
    throw new CryptoError('invalid_format', 'invalid signing public key');
  }
}

export interface CallSignatureInput {
  callId: string;
  contentTok: bigint;
  transcriptPlaintext: Uint8Array | string;
}

/** The 32-byte message that is signed. */
export async function callSignatureMessage(
  input: CallSignatureInput,
): Promise<Uint8Array<ArrayBuffer>> {
  const plaintext =
    typeof input.transcriptPlaintext === 'string'
      ? utf8(input.transcriptPlaintext)
      : input.transcriptPlaintext;
  return sha256(
    concat(lengthPrefixed(utf8(input.callId)), i64be(input.contentTok), await sha256(plaintext)),
  );
}

/** Sign a call at ingest. Returns 64 bytes (r ‖ s). */
export async function signCall(
  privateKey: CryptoKey,
  input: CallSignatureInput,
): Promise<Uint8Array<ArrayBuffer>> {
  const message = await callSignatureMessage(input);
  return new Uint8Array(await subtle().sign(SIGN, privateKey, message));
}

/** Verify a call signature against a device's SPKI public key. Returns false on any mismatch. */
export async function verifyCall(
  publicKey: Uint8Array,
  input: CallSignatureInput,
  signature: Uint8Array,
): Promise<boolean> {
  if (signature.length !== SIGNATURE_LENGTH) return false;
  const key = await importSigningPublicKey(publicKey);
  const message = await callSignatureMessage(input);
  return subtle().verify(SIGN, key, buf(signature), message);
}

/** Like `verifyCall` but throws `bad_signature`. */
export async function assertCallSignature(
  publicKey: Uint8Array,
  input: CallSignatureInput,
  signature: Uint8Array,
): Promise<void> {
  if (!(await verifyCall(publicKey, input, signature))) {
    throw new CryptoError('bad_signature', 'signature does not verify');
  }
}
