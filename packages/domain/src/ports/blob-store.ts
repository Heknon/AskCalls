import type { HealthCheckable } from './health';

export interface PresignedRequest {
  url: string;
  method: 'PUT' | 'GET';
  /** Headers the client must send with the request. */
  headers: Record<string, string>;
  expiresAt: Date;
}

/** Stores ciphertext only. Keys are opaque and never contain user content. */
export interface BlobStore extends HealthCheckable {
  put(key: string, body: Uint8Array, opts?: { contentType?: string }): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  /** Idempotent. */
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
  exists(key: string): Promise<boolean>;
  /** Byte size, or null when missing. */
  size(key: string): Promise<number | null>;
  presignPut(
    key: string,
    opts: { expiresInSec: number; contentLength?: number; contentType?: string },
  ): Promise<PresignedRequest>;
  presignGet(key: string, opts: { expiresInSec: number }): Promise<PresignedRequest>;
}
