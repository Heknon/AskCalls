/** Raw bytes. Ciphertext columns (`*Ct`) are always AES-256-GCM output, version‖nonce‖ct‖tag. */
export type Bytes = Uint8Array;

/** HMAC blind-index token (spec 6.4): first 8 bytes of HMAC-SHA256 read as a signed 64-bit integer. */
export type Token = bigint;

export type UserId = string;
export type CallId = string;

/** Days since the Unix epoch, UTC. */
export type Day = number;

export interface Page<T> {
  items: T[];
  /** Opaque cursor for the next page, or null when there are no more items. */
  nextCursor: string | null;
}

export interface PageRequest {
  cursor?: string | null;
  limit: number;
}

export const DAY_MS = 86_400_000;

export function dayFromDate(date: Date): Day {
  return Math.floor(date.getTime() / DAY_MS);
}

export function dateFromDay(day: Day): Date {
  return new Date(day * DAY_MS);
}
