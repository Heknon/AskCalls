/**
 * Isomorphic WebCrypto: key hierarchy, AEAD, wrapping, HMAC tokens, ECIES, signatures (spec 6).
 * Uses globalThis.crypto only (plus hash-wasm for Argon2id); runs unchanged in browsers and
 * Node 20+. Byte formats are documented in packages/crypto/README.md.
 */
export const CRYPTO_FORMAT_VERSION = 1;

export { type AadContext, AadFields, aad } from './aad';
export {
  AEAD_OVERHEAD,
  AEAD_VERSION,
  decrypt,
  decryptJson,
  encrypt,
  encryptJson,
  importAesKey,
  NONCE_LENGTH,
  TAG_LENGTH,
} from './aead';
export {
  concat,
  equalBytes,
  fromBase64Url,
  fromHex,
  fromUtf8,
  randomBytes,
  toBase64Url,
  toHex,
  utf8,
  wipeBytes,
} from './bytes';
export {
  decryptInboxItem,
  decryptRootKeyFromLink,
  ECIES_INFO,
  type EcdhKeyPair,
  eciesDecrypt,
  eciesEncrypt,
  encryptRootKeyForDevice,
  encryptToInbox,
  generateEcdhKeyPair,
  generateInboxKeyPair,
  type InboxKeyPair,
  joinEcies,
  openInboxPrivateKey,
  splitEcies,
} from './ecies';
export { CryptoError, type CryptoErrorReason, isCryptoError } from './errors';
export { FINGERPRINT_INFO, publicKeyFingerprint } from './fingerprint';
export { hkdfBytes, sha256, sha256Text } from './hash';
export {
  type CallContext,
  createDek,
  DEK_LENGTH,
  generateRootKey,
  INDEX_INFO,
  KEK_INFO,
  ROOT_KEY_LENGTH,
  UnlockedKeys,
  unwrapDek,
} from './keys';
export {
  ARGON2_DEFAULTS,
  ARGON2_SALT_LENGTH,
  type Argon2Params,
  estimatePassphraseStrength,
  PASSPHRASE_MIN_LENGTH,
  type PassphraseStrength,
  passphraseLength,
} from './passphrase';
export {
  type ByteSource,
  DEFAULT_SEGMENT_SIZE,
  decryptRecording,
  decryptRecordingStream,
  encryptedRecordingSize,
  encryptRecording,
  encryptRecordingStream,
  RECORDING_HEADER_LENGTH,
  type RecordingOptions,
  recordingPlaintextSize,
  toReadableStream,
} from './recording';
export {
  checkConfirmationGroups,
  formatRecoveryCode,
  generateRecoveryCode,
  normalizeRecoveryCode,
  parseRecoveryCode,
  pickConfirmationGroups,
  RECOVERY_GROUPS,
  recoveryCodeGroups,
} from './recovery';
export {
  assertCallSignature,
  type CallSignatureInput,
  callSignatureMessage,
  exportSigningPrivateKey,
  generateSigningKeyPair,
  importSigningPrivateKey,
  SIGNATURE_LENGTH,
  type SigningKeyPair,
  signCall,
  verifyCall,
} from './signing';
export {
  contentToken,
  TOKEN_KINDS,
  type TokenKind,
  type TokenValue,
  token,
  tokenSet,
  tokens,
} from './tokens';
export {
  createDeviceEntry,
  createPasskeyEntry,
  createPassphraseEntry,
  createRecoveryEntry,
  type DeviceKdfParams,
  deviceWrapKey,
  generateDeviceSecret,
  type KdfParams,
  type PasskeyKdfParams,
  type PassphraseKdfParams,
  PRF_SALT,
  passkeyWrapKey,
  passphraseWrapKey,
  type RecoveryKdfParams,
  recoveryWrapKey,
  type UnlockKind,
  unlockWithDeviceSecret,
  unlockWithPasskey,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
  unwrapRootKey,
  type WrappedRootKey,
  wrapRootKey,
} from './unlock';
