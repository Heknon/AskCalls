export type DomainErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'unauthorized'
  | 'conflict'
  | 'duplicate'
  | 'version_conflict'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'invalid'
  | 'unsupported'
  | 'provider_error';

/**
 * Marks every DomainError, so one created by another copy of this module (a bundler can load an
 * adapter's import of the domain separately from the route's) is still recognised.
 */
const BRAND = Symbol.for('askcalls.DomainError');

/** Domain errors carry a code and a content-free message. Never put plaintext in `message`. */
export class DomainError extends Error {
  readonly [BRAND] = true;

  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details: Record<string, string | number | boolean | null> = {},
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const isDomainError = (e: unknown): e is DomainError =>
  e instanceof DomainError ||
  (typeof e === 'object' && e !== null && (e as { [BRAND]?: unknown })[BRAND] === true);
