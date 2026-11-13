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

/** Domain errors carry a code and a content-free message. Never put plaintext in `message`. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details: Record<string, string | number | boolean | null> = {},
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError;
