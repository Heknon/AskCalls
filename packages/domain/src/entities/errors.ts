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
 * Shared across copies of this module. Next.js bundles route handlers, pages and middleware
 * separately, and the container (built once, on `globalThis`) holds adapters from whichever
 * bundle built it, so a plain `instanceof` misses errors thrown by another bundle's copy.
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

  /** Matches any copy of DomainError; subclasses keep the ordinary prototype check. */
  static override [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the subclass being checked.
    if (this !== DomainError) return Function.prototype[Symbol.hasInstance].call(this, value);
    return (
      typeof value === 'object' &&
      value !== null &&
      (value as { [BRAND]?: unknown })[BRAND] === true
    );
  }
}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError;
