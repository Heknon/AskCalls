import { ApiError } from '@askcalls/api-contract';
import { isCryptoError } from '@askcalls/crypto';
import { isDomainError } from '@askcalls/domain';

/** A one-line, content-free explanation of a failure for the terminal. */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'the server rejected the token; run askcalls login again';
    if (e.status === 403) return `not allowed: ${e.message}`;
    if (e.status === 429) return 'rate limited by the server; try again in a minute';
    return `server error (${e.code}): ${e.message}`;
  }
  if (isCryptoError(e)) return `decryption failed (${e.reason})`;
  if (isDomainError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return 'unexpected error';
}

export function fail(e: unknown): void {
  console.error(`askcalls: ${describeError(e)}`);
  process.exitCode = 1;
}
