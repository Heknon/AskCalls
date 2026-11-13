import { argon2id } from 'hash-wasm';
import { utf8 } from './bytes';
import { CryptoError } from './errors';

/** Spec 6.2: Argon2id, m = 64 MiB, t = 3, p = 1, 16-byte salt, 32-byte output. */
export interface Argon2Params {
  /** Memory in KiB. */
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

export const ARGON2_DEFAULTS: Readonly<Argon2Params> = Object.freeze({
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
});
export const ARGON2_SALT_LENGTH = 16;
export const PASSPHRASE_MIN_LENGTH = 12;

/**
 * Bounds accepted when re-deriving from stored `kdfParams`. They keep a tampered row from
 * freezing the device (huge memory) while allowing the small parameters tests use.
 */
const MAX_MEMORY_KIB = 1024 * 1024;
const MAX_ITERATIONS = 64;
const MAX_PARALLELISM = 16;

export function checkArgon2Params(p: Argon2Params): Argon2Params {
  const ok =
    Number.isInteger(p.memoryKiB) &&
    Number.isInteger(p.iterations) &&
    Number.isInteger(p.parallelism) &&
    p.parallelism >= 1 &&
    p.parallelism <= MAX_PARALLELISM &&
    p.iterations >= 1 &&
    p.iterations <= MAX_ITERATIONS &&
    p.memoryKiB >= 8 * p.parallelism &&
    p.memoryKiB <= MAX_MEMORY_KIB;
  if (!ok) throw new CryptoError('invalid_input', 'argon2 parameters out of range');
  return { memoryKiB: p.memoryKiB, iterations: p.iterations, parallelism: p.parallelism };
}

/** Passphrases are compared as NFC so the same text typed on different keyboards matches. */
export const normalizePassphrase = (passphrase: string): string => passphrase.normalize('NFC');

/** Length in Unicode code points after NFC normalization. */
export const passphraseLength = (passphrase: string): number =>
  [...normalizePassphrase(passphrase)].length;

export function assertPassphraseLength(passphrase: string): void {
  if (passphraseLength(passphrase) < PASSPHRASE_MIN_LENGTH) {
    throw new CryptoError('weak_passphrase', 'passphrase is too short');
  }
}

/** Argon2id(NFC(passphrase), salt) → 32 bytes. */
export async function argon2idBytes(
  passphrase: string,
  salt: Uint8Array,
  params: Argon2Params = ARGON2_DEFAULTS,
): Promise<Uint8Array> {
  const p = checkArgon2Params(params);
  if (salt.length !== ARGON2_SALT_LENGTH)
    throw new CryptoError('invalid_input', 'salt must be 16 bytes');
  return argon2id({
    password: utf8(normalizePassphrase(passphrase)),
    salt,
    memorySize: p.memoryKiB,
    iterations: p.iterations,
    parallelism: p.parallelism,
    hashLength: 32,
    outputType: 'binary',
  });
}

export interface PassphraseStrength {
  /** 0 (very weak) to 4 (strong), for a meter. */
  score: 0 | 1 | 2 | 3 | 4;
  /** Rough entropy estimate in bits. */
  bits: number;
  /** True when the minimum length is met. Only a length check is enforced; the score advises. */
  acceptable: boolean;
  /** Message keys for the UI (next-intl), never the passphrase itself. */
  warnings: Array<'too_short' | 'repeated' | 'sequence' | 'common' | 'single_class'>;
}

const COMMON = [
  'password',
  'passwort',
  'qwerty',
  'azerty',
  'letmein',
  'welcome',
  'iloveyou',
  'admin',
  'monkey',
  'dragon',
  'askcalls',
  '123456',
  'abc123',
  'qazwsx',
];

/**
 * A small, dependency-free strength estimate: character-pool entropy, discounting repeats,
 * keyboard-style runs (abc, 123, cba) and common words. It is a meter, not a guarantee.
 */
export function estimatePassphraseStrength(passphrase: string): PassphraseStrength {
  const chars = [...normalizePassphrase(passphrase)];
  const warnings: PassphraseStrength['warnings'] = [];
  const acceptable = chars.length >= PASSPHRASE_MIN_LENGTH;
  if (!acceptable) warnings.push('too_short');

  let lower = false;
  let upper = false;
  let digit = false;
  let symbol = false;
  let other = false;
  for (const c of chars) {
    if (/[a-z]/.test(c)) lower = true;
    else if (/[A-Z]/.test(c)) upper = true;
    else if (/[0-9]/.test(c)) digit = true;
    else if (/[\x20-\x7e]/.test(c)) symbol = true;
    else other = true;
  }
  const pool =
    (lower ? 26 : 0) + (upper ? 26 : 0) + (digit ? 10 : 0) + (symbol ? 33 : 0) + (other ? 100 : 0);
  const classes = [lower, upper, digit, symbol, other].filter(Boolean).length;
  if (classes <= 1 && chars.length > 0) warnings.push('single_class');

  // Count characters that add information: not a repeat or a +-1 step from the previous one.
  let effective = 0;
  let repeats = 0;
  let steps = 0;
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i]!.codePointAt(0)!;
    const prev = i > 0 ? chars[i - 1]!.codePointAt(0)! : undefined;
    if (prev === cp) repeats++;
    else if (prev !== undefined && Math.abs(cp - prev) === 1) steps++;
    else effective++;
  }
  // Repeats and steps still carry a little information.
  effective += (repeats + steps) * 0.25;
  if (repeats >= Math.max(3, chars.length / 4)) warnings.push('repeated');
  if (steps >= Math.max(3, chars.length / 4)) warnings.push('sequence');

  let bits = pool > 0 ? effective * Math.log2(pool) : 0;
  const lowered = chars.join('').toLowerCase();
  for (const word of COMMON) {
    if (lowered.includes(word)) {
      // A dictionary word is worth ~ a dozen bits, not len × log2(pool).
      bits -= Math.max(0, word.length * Math.log2(pool || 1) - 12);
      if (!warnings.includes('common')) warnings.push('common');
    }
  }
  bits = Math.max(0, Math.round(bits));
  const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  return { score: acceptable ? score : (Math.min(score, 1) as 0 | 1), bits, acceptable, warnings };
}
