/**
 * HMAC-signed blob URLs for the fs driver (local disk has no presigner of its own).
 *
 * URL shape, served by an app route that the API bucket builds:
 *
 *   <appUrl>/api/blob/<key>?exp=<unix seconds>[&len=<bytes>]&sig=<base64url HMAC-SHA256>
 *
 * The signature covers the HTTP method, the key, the expiry and, when the URL was presigned with a
 * content length, that length:
 *
 *   "askcalls-blob-v1\n" + METHOD + "\n" + key + "\n" + exp + "\n" + (len ?? "")
 *
 * The route must: take the key from the path (percent-decoded once), call `verifyBlobUrl` with the
 * request method, the query and (for PUT) the request's Content-Length, refuse with 403 on any
 * failure, refuse PUT bodies longer than `len`, then call `put`/`get` on the store. It must not log
 * bodies, must stream, and must answer with `Cache-Control: no-store`.
 *
 * WebCrypto only, so this runs in Node 20+, Bun and the edge runtime alike.
 */

export const BLOB_ROUTE_PREFIX = '/api/blob/';
const DOMAIN = 'askcalls-blob-v1';

export type BlobMethod = 'PUT' | 'GET';

export interface SignedBlobParams {
  method: BlobMethod;
  key: string;
  /** Expiry, unix seconds. */
  exp: number;
  /** Exact body length a PUT must have, when the URL was presigned with one. */
  len?: number;
}

const enc = new TextEncoder();

function canonical(p: SignedBlobParams): string {
  return [DOMAIN, p.method, p.key, String(p.exp), p.len === undefined ? '' : String(p.len)].join(
    '\n',
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const b64 = s.replaceAll('-', '+').replaceAll('_', '/');
  try {
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Imports a raw secret (at least 32 bytes) as an HMAC-SHA256 signing key. */
export async function importSigningKey(secret: Uint8Array): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error('Blob signing secret must be at least 32 bytes');
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signBlobParams(key: CryptoKey, p: SignedBlobParams): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(canonical(p)));
  return toBase64Url(new Uint8Array(mac));
}

/** Builds the full presigned URL. `baseUrl` is the app origin, e.g. `http://localhost:3000`. */
export async function buildSignedBlobUrl(
  baseUrl: string,
  key: CryptoKey,
  p: SignedBlobParams,
): Promise<string> {
  const sig = await signBlobParams(key, p);
  const url = new URL(BLOB_ROUTE_PREFIX + p.key, baseUrl);
  url.searchParams.set('exp', String(p.exp));
  if (p.len !== undefined) url.searchParams.set('len', String(p.len));
  url.searchParams.set('sig', sig);
  return url.toString();
}

export type VerifyFailure = 'malformed' | 'expired' | 'bad_signature' | 'length_mismatch';

export type VerifyResult =
  | { ok: true; params: SignedBlobParams }
  | { ok: false; reason: VerifyFailure };

const DIGITS = /^\d{1,15}$/;

/**
 * Verifies a request against its signed URL. `contentLength` is the PUT request's
 * Content-Length; when the URL carries `len` the two must match exactly.
 */
export async function verifyBlobUrl(
  key: CryptoKey,
  req: {
    method: string;
    blobKey: string;
    query: URLSearchParams;
    contentLength?: number | null;
    now?: Date;
  },
): Promise<VerifyResult> {
  const method = req.method.toUpperCase();
  if (method !== 'PUT' && method !== 'GET') return { ok: false, reason: 'malformed' };
  const exp = req.query.get('exp');
  const len = req.query.get('len');
  const sig = req.query.get('sig');
  if (!exp || !DIGITS.test(exp) || !sig || (len !== null && !DIGITS.test(len))) {
    return { ok: false, reason: 'malformed' };
  }
  const sigBytes = fromBase64Url(sig);
  if (sigBytes?.length !== 32) return { ok: false, reason: 'malformed' };
  const params: SignedBlobParams = {
    method,
    key: req.blobKey,
    exp: Number(exp),
    ...(len !== null ? { len: Number(len) } : {}),
  };
  // Constant-time comparison happens inside WebCrypto's verify.
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(canonical(params)));
  if (!valid) return { ok: false, reason: 'bad_signature' };
  const nowSec = Math.floor((req.now ?? new Date()).getTime() / 1000);
  if (params.exp < nowSec) return { ok: false, reason: 'expired' };
  if (method === 'PUT' && params.len !== undefined && req.contentLength !== params.len) {
    return { ok: false, reason: 'length_mismatch' };
  }
  return { ok: true, params };
}
