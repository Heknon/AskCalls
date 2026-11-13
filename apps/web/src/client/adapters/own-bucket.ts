import type { OwnBucketStore } from '@askcalls/client-core/context';
import type { UserDataDocs } from '@askcalls/client-core/userdata';
import { DomainError } from '@askcalls/domain';
import { queryString, sha256Hex, signRequest, uriEncode } from './sigv4';
import { assertOk, type Progress, readBody } from './transfer';

export type BucketConfig = Extract<
  UserDataDocs['providers']['recordings'],
  { mode: 'own' }
>['bucket'];

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface BucketTarget {
  url: URL;
  host: string;
  /** Decoded path as signed. */
  path: string;
}

function endpointUrl(endpoint: string): URL {
  return new URL(/^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`);
}

/**
 * AWS endpoints use virtual-hosted style (`bucket.s3.region.amazonaws.com`) when the bucket name
 * allows it; every other S3-compatible service (R2, MinIO, B2) gets path style.
 */
export function bucketTarget(b: BucketConfig, objectKey?: string): BucketTarget {
  const base = endpointUrl(b.endpoint);
  const virtual = /(^|\.)amazonaws\.com$/i.test(base.hostname) && /^[a-z0-9-]+$/.test(b.bucket);
  const prefix = base.pathname.replace(/\/+$/, '');
  const keyPath = objectKey === undefined ? '/' : `/${objectKey}`;
  const path = virtual ? `${prefix}${keyPath}` : `${prefix}/${b.bucket}${keyPath}`;
  const host = virtual ? `${b.bucket}.${base.host}` : base.host;
  return { url: new URL(`${base.protocol}//${host}${uriEncode(path, false)}`), host, path };
}

/** The origin the browser talks to for this bucket (for CSP connect-src). */
export const bucketOrigin = (b: BucketConfig) => bucketTarget(b).url.origin;

/** CORS rules the user pastes into their bucket so this app can PUT/GET/DELETE directly. */
export function corsRulesFor(appOrigin: string) {
  return [
    {
      AllowedOrigins: [appOrigin],
      AllowedMethods: ['GET', 'PUT', 'DELETE', 'HEAD'],
      AllowedHeaders: [
        'authorization',
        'content-type',
        'x-amz-content-sha256',
        'x-amz-date',
        'x-amz-security-token',
      ],
      ExposeHeaders: ['etag', 'content-length'],
      MaxAgeSeconds: 3600,
    },
  ];
}

export type BucketProbe =
  | { ok: true }
  | {
      ok: false;
      reason: 'cors_or_network' | 'unauthorized' | 'not_found' | 'http';
      status?: number;
    };

/**
 * Recordings in the user's own bucket, signed on the device with SigV4 (spec 11.2a).
 * `resolve` maps a call's `bucketRef` to the decrypted bucket settings.
 */
export class SigV4BucketStore implements OwnBucketStore {
  private readonly fetchImpl: Fetch;
  private readonly now: () => Date;
  private readonly onProgress: Progress | undefined;

  constructor(
    private readonly resolve: (bucketRef: string) => Promise<BucketConfig>,
    opts: { fetch?: Fetch; now?: () => Date; onProgress?: Progress } = {},
  ) {
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
    this.now = opts.now ?? (() => new Date());
    this.onProgress = opts.onProgress;
  }

  async put(bucketRef: string, objectKey: string, body: Uint8Array): Promise<void> {
    const res = await this.#send(await this.resolve(bucketRef), 'PUT', objectKey, body);
    await assertOk(res, 'bucket upload');
    await res.body?.cancel().catch(() => {});
  }

  async get(bucketRef: string, objectKey: string): Promise<Uint8Array> {
    const res = await this.#send(await this.resolve(bucketRef), 'GET', objectKey);
    return readBody(await assertOk(res, 'bucket download'), this.onProgress);
  }

  async delete(bucketRef: string, objectKey: string): Promise<void> {
    const res = await this.#send(await this.resolve(bucketRef), 'DELETE', objectKey);
    if (res.status !== 404) await assertOk(res, 'bucket delete');
    await res.body?.cancel().catch(() => {});
  }

  /** Settings → Providers "Test connection": a signed list of at most one key. */
  async probe(bucket: BucketConfig): Promise<BucketProbe> {
    let res: Response;
    try {
      res = await this.#send(bucket, 'GET', undefined, undefined, [
        ['list-type', '2'],
        ['max-keys', '1'],
      ]);
    } catch {
      return { ok: false, reason: 'cors_or_network' };
    }
    await res.body?.cancel().catch(() => {});
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'unauthorized', status: res.status };
    }
    if (res.status === 404) return { ok: false, reason: 'not_found', status: 404 };
    return { ok: false, reason: 'http', status: res.status };
  }

  async #send(
    bucket: BucketConfig,
    method: 'GET' | 'PUT' | 'DELETE',
    objectKey: string | undefined,
    body?: Uint8Array,
    query: Array<[string, string]> = [],
  ): Promise<Response> {
    const t = bucketTarget(bucket, objectKey);
    const payloadHash = await sha256Hex(body ?? new Uint8Array());
    const headers: Record<string, string> = { 'x-amz-content-sha256': payloadHash };
    if (body) headers['content-type'] = 'application/octet-stream';
    const signed = await signRequest({
      method,
      host: t.host,
      path: t.path,
      query,
      headers,
      payloadHash,
      region: bucket.region || 'us-east-1',
      service: 's3',
      credentials: { accessKeyId: bucket.accessKeyId, secretAccessKey: bucket.secretAccessKey },
      date: this.now(),
      singleEncodePath: true,
    });
    const url = query.length ? `${t.url.href}?${queryString(query)}` : t.url.href;
    try {
      return await this.fetchImpl(url, {
        method,
        headers: signed,
        ...(body ? { body: body as BodyInit } : {}),
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      throw new DomainError('provider_error', 'bucket unreachable (network or CORS)', {
        status: null,
      });
    }
  }
}
