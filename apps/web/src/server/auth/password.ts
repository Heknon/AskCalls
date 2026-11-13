import { argon2id, argon2Verify } from 'hash-wasm';

/** OWASP's Argon2id baseline: 19 MiB, 2 passes, 1 lane. */
const PARAMS = { memorySize: 19_456, iterations: 2, parallelism: 1, hashLength: 32 } as const;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 256;

export function acceptablePassword(password: string): boolean {
  return password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;
}

/** An Argon2id PHC string (`$argon2id$v=19$m=…`) with a random 16-byte salt. */
export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: globalThis.crypto.getRandomValues(new Uint8Array(16)),
    ...PARAMS,
    outputType: 'encoded',
  });
}

// Verified when the account doesn't exist, so a missing account costs the same time.
let dummy: Promise<string> | null = null;

export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  if (!hash) {
    dummy ??= hashPassword('not a real password');
    await argon2Verify({ password, hash: await dummy });
    return false;
  }
  try {
    return await argon2Verify({ password, hash });
  } catch {
    return false;
  }
}
