import type { BlobStore, HealthResult, PresignedRequest } from '@askcalls/domain';
import { DomainError } from '@askcalls/domain';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3BlobStoreOptions {
  bucket: string;
  /**
   * Custom endpoint for non-AWS services, e.g. `https://<account>.r2.cloudflarestorage.com`,
   * `https://s3.<region>.backblazeb2.com`, `http://localhost:9000` (MinIO). Omit for AWS S3.
   */
  endpoint?: string;
  /** AWS region, `auto` for R2. Defaults to `auto` with a custom endpoint, else `us-east-1`. */
  region?: string;
  /** Path-style URLs (`<endpoint>/<bucket>/<key>`). Defaults to true with a custom endpoint. */
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Key prefix for every object, e.g. `preview/pr-12/`. */
  keyPrefix?: string;
  /** Inject a preconfigured client (tests, or the browser own-bucket flow). */
  client?: S3Client;
}

/** S3 caps presigned URLs at 7 days. */
const MAX_EXPIRES_SEC = 7 * 24 * 3600;
const DELETE_BATCH = 1000;

const statusOf = (e: unknown): number | undefined =>
  e instanceof S3ServiceException ? e.$metadata.httpStatusCode : undefined;

const isNotFound = (e: unknown): boolean =>
  statusOf(e) === 404 ||
  (e instanceof S3ServiceException && (e.name === 'NoSuchKey' || e.name === 'NotFound'));

/** Content-free error: operation and HTTP status only. Never the key or body. */
export function providerError(op: string, e: unknown): DomainError {
  const status = statusOf(e);
  return new DomainError('provider_error', `Blob storage ${op} failed`, {
    status: status ?? null,
    code: e instanceof S3ServiceException ? e.name : null,
  });
}

export function buildS3Client(opts: Omit<S3BlobStoreOptions, 'bucket' | 'client' | 'keyPrefix'>) {
  const custom = Boolean(opts.endpoint);
  return new S3Client({
    ...(opts.endpoint ? { endpoint: opts.endpoint } : {}),
    region: opts.region ?? (custom ? 'auto' : 'us-east-1'),
    forcePathStyle: opts.forcePathStyle ?? custom,
    ...(opts.accessKeyId && opts.secretAccessKey
      ? { credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey } }
      : {}),
    // Since SDK 3.729 the client adds CRC32 checksums to every upload by default. R2, B2 and
    // older MinIO reject or mishandle them, and on a presigned PUT they would force the browser
    // to send a checksum header it can't compute. Only send checksums when an operation needs one.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/**
 * BlobStore over the S3 API: AWS S3, Cloudflare R2, MinIO, Backblaze B2. Stores ciphertext only;
 * keys are opaque ids. Works in Node and in the browser (own-bucket mode signs on the device).
 */
export class S3BlobStore implements BlobStore {
  readonly client: S3Client;
  readonly bucket: string;
  private readonly prefix: string;

  constructor(opts: S3BlobStoreOptions) {
    if (!opts.bucket) throw new DomainError('invalid', 'S3 bucket is required');
    this.bucket = opts.bucket;
    this.prefix = opts.keyPrefix ?? '';
    this.client = opts.client ?? buildS3Client(opts);
  }

  private k(key: string): string {
    if (!key || key.length > 1024)
      throw new DomainError('invalid', 'Blob key has an invalid length');
    return this.prefix + key;
  }

  async put(key: string, body: Uint8Array, opts?: { contentType?: string }): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.k(key),
          Body: body,
          ContentLength: body.length,
          ContentType: opts?.contentType ?? 'application/octet-stream',
        }),
      );
    } catch (e) {
      if (e instanceof DomainError) throw e;
      throw providerError('put', e);
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.k(key) }),
      );
      if (!res.Body) return new Uint8Array(0);
      return await res.Body.transformToByteArray();
    } catch (e) {
      if (e instanceof DomainError) throw e;
      if (isNotFound(e)) return null;
      throw providerError('get', e);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.k(key) }));
    } catch (e) {
      if (e instanceof DomainError) throw e;
      if (isNotFound(e)) return;
      throw providerError('delete', e);
    }
  }

  async deletePrefix(prefix: string): Promise<number> {
    const full = this.prefix + prefix;
    if (full === '') throw new DomainError('invalid', 'Refusing to delete the whole bucket');
    let deleted = 0;
    let token: string | undefined;
    try {
      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: full,
            ContinuationToken: token,
            MaxKeys: DELETE_BATCH,
          }),
        );
        const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
        if (keys.length) {
          const res = await this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: { Objects: keys, Quiet: true },
            }),
          );
          if (res.Errors?.length) {
            throw new DomainError('provider_error', 'Blob storage deletePrefix failed', {
              failed: res.Errors.length,
            });
          }
          deleted += keys.length;
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    } catch (e) {
      if (e instanceof DomainError) throw e;
      throw providerError('deletePrefix', e);
    }
    return deleted;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.size(key)) !== null;
  }

  async size(key: string): Promise<number | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.k(key) }),
      );
      return res.ContentLength ?? 0;
    } catch (e) {
      if (e instanceof DomainError) throw e;
      if (isNotFound(e)) return null;
      throw providerError('head', e);
    }
  }

  /**
   * Presigned PUT. With `contentLength`, `content-length` is a signed header, so the service
   * rejects any body of a different size (browsers set Content-Length from the body themselves).
   * With `contentType`, the client must send that exact Content-Type (returned in `headers`).
   */
  async presignPut(
    key: string,
    opts: { expiresInSec: number; contentLength?: number; contentType?: string },
  ): Promise<PresignedRequest> {
    checkExpiry(opts.expiresInSec);
    if (opts.contentLength !== undefined) {
      if (!Number.isSafeInteger(opts.contentLength) || opts.contentLength < 0) {
        throw new DomainError('invalid', 'Content length must be a non-negative integer');
      }
    }
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.k(key),
      ...(opts.contentLength !== undefined ? { ContentLength: opts.contentLength } : {}),
      ...(opts.contentType ? { ContentType: opts.contentType } : {}),
    });
    const signableHeaders = new Set<string>();
    if (opts.contentLength !== undefined) signableHeaders.add('content-length');
    if (opts.contentType) signableHeaders.add('content-type');
    const expiresAt = new Date(Date.now() + opts.expiresInSec * 1000);
    const url = await getSignedUrl(this.client, command, {
      expiresIn: opts.expiresInSec,
      signableHeaders,
    });
    const headers: Record<string, string> = {};
    if (opts.contentLength !== undefined) headers['content-length'] = String(opts.contentLength);
    if (opts.contentType) headers['content-type'] = opts.contentType;
    return { url, method: 'PUT', headers, expiresAt };
  }

  async presignGet(key: string, opts: { expiresInSec: number }): Promise<PresignedRequest> {
    checkExpiry(opts.expiresInSec);
    const expiresAt = new Date(Date.now() + opts.expiresInSec * 1000);
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: this.k(key) }),
      { expiresIn: opts.expiresInSec },
    );
    return { url, method: 'GET', headers: {}, expiresAt };
  }

  async healthCheck(): Promise<HealthResult> {
    const started = Date.now();
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { ok: true, message: 'connected', latencyMs: Date.now() - started };
    } catch (e) {
      const status = statusOf(e);
      const message =
        status === 404
          ? 'bucket not found'
          : status === 403
            ? 'access denied'
            : status === 400 || status === 301
              ? 'wrong region or endpoint'
              : status
                ? `error ${status}`
                : 'unreachable';
      return { ok: false, message, latencyMs: Date.now() - started };
    }
  }
}

function checkExpiry(sec: number) {
  if (!Number.isInteger(sec) || sec <= 0 || sec > MAX_EXPIRES_SEC) {
    throw new DomainError('invalid', 'Presign expiry is out of range');
  }
}
