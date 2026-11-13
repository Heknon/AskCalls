import { randomBytes, randomInt } from './bytes';
import { CryptoError } from './errors';

/**
 * Recovery codes (spec 6.2).
 *
 * A code is 20 random bytes (160 bits) written as 32 Crockford base32 characters in 8 groups of
 * 4: `7K3M-…-Q9ZD`. 8 × 4 × 5 bits = 160 bits exactly, so every character is random and there is
 * no padding. That exceeds the spec's 128-bit minimum and keeps each displayed group uniform.
 *
 * Crockford's alphabet (0-9, A-Z without I, L, O, U) avoids look-alike letters, and parsing is
 * forgiving: case is ignored, spaces, dashes and underscores are dropped, `O` reads as `0` and
 * `I`/`L` read as `1`.
 *
 * There is deliberately no checksum: a mistyped code simply fails to unwrap the root key (the
 * AES-GCM tag is the check), so a checksum would only spend characters to report the same error
 * earlier. Onboarding confirms the user wrote it down by asking them to retype two random groups
 * (`pickConfirmationGroups`, `checkConfirmationGroups`).
 */
export const RECOVERY_CODE_BYTES = 20;
export const RECOVERY_GROUPS = 8;
export const RECOVERY_GROUP_LENGTH = 4;
const CHARS = RECOVERY_GROUPS * RECOVERY_GROUP_LENGTH;

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DECODE = new Map<string, number>([...ALPHABET].map((c, i) => [c, i]));
DECODE.set('O', 0);
DECODE.set('I', 1);
DECODE.set('L', 1);

/** Crockford base32 of exactly 20 bytes (no padding needed: 160 bits = 32 characters). */
function encode(bytes: Uint8Array): string {
  let out = '';
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = ((acc << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(acc >> bits) & 31];
    }
  }
  return out;
}

/** Format 20 code bytes as `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. */
export function formatRecoveryCode(bytes: Uint8Array): string {
  if (bytes.length !== RECOVERY_CODE_BYTES) {
    throw new CryptoError('invalid_input', 'recovery code must be 20 bytes');
  }
  return recoveryCodeGroups(encode(bytes)).join('-');
}

/** Normalize user input to the 32 canonical characters, or throw `invalid_recovery_code`. */
export function normalizeRecoveryCode(input: string): string {
  let out = '';
  for (const ch of input.toUpperCase()) {
    if (ch === ' ' || ch === '-' || ch === '_' || ch === '\t' || ch === '\n' || ch === '\r')
      continue;
    const v = DECODE.get(ch);
    if (v === undefined) throw new CryptoError('invalid_recovery_code', 'invalid character');
    out += ALPHABET[v];
  }
  if (out.length !== CHARS) throw new CryptoError('invalid_recovery_code', 'wrong length');
  return out;
}

/** Parse a typed recovery code to its 20 bytes. */
export function parseRecoveryCode(input: string): Uint8Array<ArrayBuffer> {
  const chars = normalizeRecoveryCode(input);
  const out = new Uint8Array(RECOVERY_CODE_BYTES);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (const ch of chars) {
    acc = ((acc << 5) | DECODE.get(ch)!) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

/** Generate a new code: the bytes (for key derivation) and the formatted string (show once). */
export function generateRecoveryCode(): { bytes: Uint8Array<ArrayBuffer>; code: string } {
  const bytes = randomBytes(RECOVERY_CODE_BYTES);
  return { bytes, code: formatRecoveryCode(bytes) };
}

/** Split a code (formatted or not) into its 8 canonical groups. */
export function recoveryCodeGroups(code: string): string[] {
  const chars = normalizeRecoveryCode(code);
  const groups: string[] = [];
  for (let i = 0; i < CHARS; i += RECOVERY_GROUP_LENGTH) {
    groups.push(chars.slice(i, i + RECOVERY_GROUP_LENGTH));
  }
  return groups;
}

/** Two distinct random group indices (0-based, ascending) for the onboarding retype check. */
export function pickConfirmationGroups(): [number, number] {
  const a = randomInt(RECOVERY_GROUPS);
  let b = randomInt(RECOVERY_GROUPS - 1);
  if (b >= a) b += 1;
  return a < b ? [a, b] : [b, a];
}

/**
 * True when every answered group matches the code. Answers are normalized like full codes
 * (case, spaces, dashes, O/I/L), so `k3mo` matches the group `K3M0`.
 */
export function checkConfirmationGroups(code: string, answers: Record<number, string>): boolean {
  const groups = recoveryCodeGroups(code);
  const entries = Object.entries(answers);
  if (entries.length === 0) return false;
  return entries.every(([index, answer]) => {
    const expected = groups[Number(index)];
    if (expected === undefined) return false;
    let normalized = '';
    for (const ch of answer.toUpperCase()) {
      if (ch === ' ' || ch === '-' || ch === '_') continue;
      const v = DECODE.get(ch);
      if (v === undefined) return false;
      normalized += ALPHABET[v];
    }
    return normalized === expected;
  });
}
