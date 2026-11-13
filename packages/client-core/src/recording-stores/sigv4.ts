/**
 * AWS Signature Version 4 with WebCrypto, for the user's own S3-compatible bucket (spec 11.2a).
 * The device signs requests itself, so neither the credentials nor the recordings pass through
 * our server. No AWS SDK in the client bundle.
 */

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface SigV4Request {
  method: string;
  host: string;
  /** Decoded path, starting with `/`. */
  path: string;
  query?: Array<[string, string]>;
  /** Headers to sign besides `host` and `x-amz-date` (added here). */
  headers?: Record<string, string>;
  /** Hex SHA-256 of the body, or `UNSIGNED-PAYLOAD`. */
  payloadHash: string;
  region: string;
  service: string;
  credentials: SigV4Credentials;
  date: Date;
  /** S3 encodes the path once; every other service encodes it twice. */
  singleEncodePath?: boolean;
}

export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
const ALGORITHM = 'AWS4-HMAC-SHA256';
const enc = new TextEncoder();

/** RFC 3986 percent-encoding as SigV4 defines it (unreserved characters kept, `/` optional). */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = '';
  for (const byte of enc.encode(value)) {
    const c = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-._~]/.test(c) || (c === '/' && !encodeSlash)) out += c;
    else out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  return toHex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}

/** `20130524T000000Z` */
export function amzDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function canonicalQuery(query: Array<[string, string]>): string {
  return query
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

function canonicalHeaders(headers: Record<string, string>) {
  const entries = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, ' ')] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    canonical: entries.map(([k, v]) => `${k}:${v}\n`).join(''),
    signed: entries.map(([k]) => k).join(';'),
  };
}

async function signingKey(c: SigV4Credentials, day: string, region: string, service: string) {
  const kDate = await hmac(enc.encode(`AWS4${c.secretAccessKey}`), day);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function canonicalUri(req: SigV4Request): string {
  const once = uriEncode(req.path, false);
  return req.singleEncodePath ? once : uriEncode(once, false);
}

async function signature(
  req: SigV4Request,
  headers: Record<string, string>,
  query: Array<[string, string]>,
) {
  const date = amzDate(req.date);
  const day = date.slice(0, 8);
  const scope = `${day}/${req.region}/${req.service}/aws4_request`;
  const h = canonicalHeaders(headers);
  const canonicalRequest = [
    req.method.toUpperCase(),
    canonicalUri(req),
    canonicalQuery(query),
    h.canonical,
    h.signed,
    req.payloadHash,
  ].join('\n');
  const stringToSign = [ALGORITHM, date, scope, await sha256Hex(canonicalRequest)].join('\n');
  const key = await signingKey(req.credentials, day, req.region, req.service);
  return { signature: toHex(await hmac(key, stringToSign)), scope, signedHeaders: h.signed, date };
}

/** Signs with an `Authorization` header. Returns every header the request must send. */
export async function signRequest(req: SigV4Request): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    ...req.headers,
    host: req.host,
    'x-amz-date': amzDate(req.date),
  };
  if (req.credentials.sessionToken) headers['x-amz-security-token'] = req.credentials.sessionToken;
  const s = await signature(req, headers, req.query ?? []);
  const authorization = `${ALGORITHM} Credential=${req.credentials.accessKeyId}/${s.scope}, SignedHeaders=${s.signedHeaders}, Signature=${s.signature}`;
  const { host: _host, ...rest } = headers;
  return { ...rest, authorization };
}

/** A presigned URL (query-string auth), valid for `expiresSec`. Only `host` is signed. */
export async function presignQuery(
  req: Omit<SigV4Request, 'payloadHash' | 'headers'> & { expiresSec: number },
): Promise<Array<[string, string]>> {
  const date = amzDate(req.date);
  const scope = `${date.slice(0, 8)}/${req.region}/${req.service}/aws4_request`;
  const query: Array<[string, string]> = [
    ...(req.query ?? []),
    ['X-Amz-Algorithm', ALGORITHM],
    ['X-Amz-Credential', `${req.credentials.accessKeyId}/${scope}`],
    ['X-Amz-Date', date],
    ['X-Amz-Expires', String(req.expiresSec)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  if (req.credentials.sessionToken) {
    query.push(['X-Amz-Security-Token', req.credentials.sessionToken]);
  }
  const s = await signature({ ...req, payloadHash: UNSIGNED_PAYLOAD }, { host: req.host }, query);
  return [...query, ['X-Amz-Signature', s.signature]];
}

/** Serializes a query exactly as it was signed. */
export function queryString(query: Array<[string, string]>): string {
  return query.map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`).join('&');
}
