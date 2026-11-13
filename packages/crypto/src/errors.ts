import { DomainError, type DomainErrorCode } from '@askcalls/domain';

/**
 * Why a crypto operation failed. Content-free by construction: reasons are fixed codes.
 * - `decrypt_failed`: AES-GCM authentication failed (wrong key, wrong AAD or tampered bytes).
 * - `wrong_key`: unwrapping the root key failed; the unlock secret is wrong (or the entry is corrupt).
 * - `bad_signature`: a device signature did not verify.
 * - `invalid_format`: bytes are too short, malformed or carry an unknown version byte.
 * - `invalid_input`: an argument is out of range (key length, kind, segment size, …).
 * - `weak_passphrase`: the passphrase is shorter than the minimum length.
 * - `invalid_recovery_code`: the recovery code does not parse.
 * - `truncated`: a segmented stream ended before its final segment.
 * - `locked`: the unlocked key set was wiped.
 */
export type CryptoErrorReason =
  | 'decrypt_failed'
  | 'wrong_key'
  | 'bad_signature'
  | 'invalid_format'
  | 'invalid_input'
  | 'weak_passphrase'
  | 'invalid_recovery_code'
  | 'truncated'
  | 'locked';

const CODE_FOR: Record<CryptoErrorReason, DomainErrorCode> = {
  decrypt_failed: 'invalid',
  wrong_key: 'unauthorized',
  bad_signature: 'invalid',
  invalid_format: 'invalid',
  invalid_input: 'invalid',
  weak_passphrase: 'invalid',
  invalid_recovery_code: 'invalid',
  truncated: 'invalid',
  locked: 'unauthorized',
};

/** A `DomainError` with a typed crypto `reason`. Messages never include key material or plaintext. */
export class CryptoError extends DomainError {
  constructor(
    readonly reason: CryptoErrorReason,
    message: string,
  ) {
    super(CODE_FOR[reason], message, { reason });
    this.name = 'CryptoError';
  }
}

export const isCryptoError = (e: unknown, reason?: CryptoErrorReason): e is CryptoError =>
  e instanceof CryptoError && (reason === undefined || e.reason === reason);
