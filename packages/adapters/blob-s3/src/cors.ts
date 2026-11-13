import {
  type CORSRule,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { providerError, type S3BlobStore } from './s3-blob-store';

/**
 * Browser uploads and downloads go straight to the bucket with presigned URLs (spec 11.2a), so
 * the bucket must allow the app's origin for PUT and GET with a Content-Type header and expose
 * ETag. Content-Length is set by the browser and needs no CORS entry.
 */
export const CORS_METHODS = ['GET', 'PUT', 'HEAD'] as const;
export const CORS_HEADERS = ['content-type'] as const;
export const CORS_EXPOSE = ['ETag', 'Content-Length'] as const;
export const CORS_MAX_AGE_SEC = 3600;

/** The S3 `CORSRules` for the given app origins (also what `applyBucketCors` writes). */
export function corsRules(origins: string[]): CORSRule[] {
  return [
    {
      AllowedOrigins: origins.map(normalizeOrigin),
      AllowedMethods: [...CORS_METHODS],
      AllowedHeaders: [...CORS_HEADERS],
      ExposeHeaders: [...CORS_EXPOSE],
      MaxAgeSeconds: CORS_MAX_AGE_SEC,
    },
  ];
}

/**
 * The exact JSON to paste into the bucket's CORS settings. The same array works in the AWS S3
 * console (Permissions → CORS) and the Cloudflare R2 dashboard (Settings → CORS policy). For
 * MinIO and Backblaze B2, use `applyBucketCors` or `aws s3api put-bucket-cors` with
 * `{"CORSRules": <this array>}`.
 */
export function corsJson(origins: string[]): string {
  return JSON.stringify(corsRules(origins), null, 2);
}

/** `aws s3api put-bucket-cors --cors-configuration` document, for CLI users. */
export function corsConfigurationJson(origins: string[]): string {
  return JSON.stringify({ CORSRules: corsRules(origins) }, null, 2);
}

export type CorsProblem =
  | 'no_cors_configuration'
  | 'origin_not_allowed'
  | 'put_not_allowed'
  | 'get_not_allowed'
  | 'content_type_header_not_allowed'
  | 'etag_not_exposed';

export type CorsCheck =
  | { status: 'ok' }
  | { status: 'missing'; problems: CorsProblem[]; fixJson: string }
  /** The credentials may not read the CORS configuration; use `checkCorsByPreflight`. */
  | { status: 'unknown'; reason: 'access_denied' | 'unsupported' | 'error'; httpStatus?: number };

function normalizeOrigin(o: string): string {
  return o === '*' ? o : o.replace(/\/+$/, '');
}

/** S3 origin patterns allow one `*` wildcard. */
function originMatches(pattern: string, origin: string): boolean {
  const p = normalizeOrigin(pattern);
  if (p === '*') return true;
  const star = p.indexOf('*');
  if (star === -1) return p.toLowerCase() === origin.toLowerCase();
  const head = p.slice(0, star).toLowerCase();
  const tail = p.slice(star + 1).toLowerCase();
  const o = origin.toLowerCase();
  return o.length >= head.length + tail.length && o.startsWith(head) && o.endsWith(tail);
}

function headerAllowed(rule: CORSRule, header: string): boolean {
  return (rule.AllowedHeaders ?? []).some((h) => h === '*' || h.toLowerCase() === header);
}

/** Evaluates CORS rules for one origin. Exported for tests and for rules fetched elsewhere. */
export function evaluateCorsRules(rules: CORSRule[], origin: string): CorsProblem[] {
  const o = normalizeOrigin(origin);
  if (!rules.length) return ['no_cors_configuration'];
  const forOrigin = rules.filter((r) => (r.AllowedOrigins ?? []).some((p) => originMatches(p, o)));
  if (!forOrigin.length) return ['origin_not_allowed'];
  const problems: CorsProblem[] = [];
  const puts = forOrigin.filter((r) => (r.AllowedMethods ?? []).includes('PUT'));
  if (!puts.length) problems.push('put_not_allowed');
  else if (!puts.some((r) => headerAllowed(r, 'content-type'))) {
    problems.push('content_type_header_not_allowed');
  }
  if (!forOrigin.some((r) => (r.AllowedMethods ?? []).includes('GET'))) {
    problems.push('get_not_allowed');
  }
  if (
    !forOrigin.some((r) =>
      (r.ExposeHeaders ?? []).some((h) => h === '*' || h.toLowerCase() === 'etag'),
    )
  ) {
    problems.push('etag_not_exposed');
  }
  return problems;
}

/** Reads the bucket's CORS configuration and checks it allows `origin` (spec 11.2a). */
export async function checkBucketCors(store: S3BlobStore, origin: string): Promise<CorsCheck> {
  let rules: CORSRule[];
  try {
    const res = await store.client.send(new GetBucketCorsCommand({ Bucket: store.bucket }));
    rules = res.CORSRules ?? [];
  } catch (e) {
    const status = e instanceof S3ServiceException ? e.$metadata.httpStatusCode : undefined;
    const name = e instanceof S3ServiceException ? e.name : '';
    if (name === 'NoSuchCORSConfiguration' || (status === 404 && name !== 'NoSuchBucket')) {
      rules = [];
    } else if (status === 403) {
      return { status: 'unknown', reason: 'access_denied', httpStatus: status };
    } else if (status === 501 || name === 'NotImplemented') {
      return { status: 'unknown', reason: 'unsupported', httpStatus: status };
    } else {
      return { status: 'unknown', reason: 'error', ...(status ? { httpStatus: status } : {}) };
    }
  }
  const problems = evaluateCorsRules(rules, origin);
  return problems.length
    ? { status: 'missing', problems, fixJson: corsJson([origin]) }
    : { status: 'ok' };
}

/**
 * Checks CORS the way a browser would: a preflight OPTIONS for a presigned PUT, then for a GET.
 * Works with credentials that can't read the CORS configuration. Server or agent only (browsers
 * don't let scripts send preflights themselves).
 */
export async function checkCorsByPreflight(
  store: S3BlobStore,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CorsCheck> {
  const o = normalizeOrigin(origin);
  const probeKey = `.askcalls-cors-probe-${crypto.randomUUID()}`;
  const put = await store.presignPut(probeKey, {
    expiresInSec: 60,
    contentType: 'application/octet-stream',
  });
  const get = await store.presignGet(probeKey, { expiresInSec: 60 });
  const problems: CorsProblem[] = [];
  try {
    const p = await fetchImpl(put.url, {
      method: 'OPTIONS',
      headers: {
        Origin: o,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    const allowOrigin = p.headers.get('access-control-allow-origin');
    if (!p.ok || (allowOrigin !== '*' && allowOrigin !== o)) {
      problems.push(allowOrigin ? 'put_not_allowed' : 'origin_not_allowed');
    } else {
      const methods = (p.headers.get('access-control-allow-methods') ?? '').toUpperCase();
      if (methods && !methods.split(/\s*,\s*/).includes('PUT')) problems.push('put_not_allowed');
      const hdrs = (p.headers.get('access-control-allow-headers') ?? '').toLowerCase();
      if (hdrs && hdrs !== '*' && !hdrs.split(/\s*,\s*/).includes('content-type')) {
        problems.push('content_type_header_not_allowed');
      }
    }
    const g = await fetchImpl(get.url, {
      method: 'OPTIONS',
      headers: { Origin: o, 'Access-Control-Request-Method': 'GET' },
    });
    const gOrigin = g.headers.get('access-control-allow-origin');
    if (!g.ok || (gOrigin !== '*' && gOrigin !== o)) problems.push('get_not_allowed');
  } catch {
    return { status: 'unknown', reason: 'error' };
  }
  if (problems.includes('origin_not_allowed') && problems.includes('get_not_allowed')) {
    return { status: 'missing', problems: ['origin_not_allowed'], fixJson: corsJson([o]) };
  }
  return problems.length
    ? { status: 'missing', problems, fixJson: corsJson([o]) }
    : { status: 'ok' };
}

/** Writes the CORS configuration for `origins` (needs `s3:PutBucketCORS`). */
export async function applyBucketCors(store: S3BlobStore, origins: string[]): Promise<void> {
  try {
    await store.client.send(
      new PutBucketCorsCommand({
        Bucket: store.bucket,
        CORSConfiguration: { CORSRules: corsRules(origins) },
      }),
    );
  } catch (e) {
    throw providerError('putBucketCors', e);
  }
}
