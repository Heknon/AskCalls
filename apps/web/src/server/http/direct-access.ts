import { DIRECT_COOKIE, DIRECT_COOKIE_SECURE, readDirectCookie } from '../../client/direct-origins';

/**
 * The `askcalls-direct` cookie is set only by PUT /api/settings/direct-access, HttpOnly and
 * signed with an HMAC over the signed-in user's id and the value, so script on the page cannot
 * write one that widens `connect-src`, and one user's cookie does nothing for another.
 * Format: `<base64url HMAC-SHA256>.<base64url value>`, so cookie parsers leave it as is.
 */

const MAX_AGE_SEC = 400 * 24 * 3600;
const keys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(`askcalls-direct:${secret}`),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
    keys.set(secret, key);
  }
  return key;
}

const message = (userId: string, value: string) => new TextEncoder().encode(`${userId}\0${value}`);

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function signDirectCookie(
  secret: string,
  userId: string,
  value: string,
): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret), message(userId, value));
  return `${base64url(new Uint8Array(mac))}.${base64url(new TextEncoder().encode(value))}`;
}

/** The cookie's value when its signature holds for this user, else null. */
export async function verifyDirectCookie(
  secret: string,
  userId: string,
  cookie: string | undefined,
): Promise<string | null> {
  if (!cookie) return null;
  const [macPart = '', valuePart = '', ...rest] = cookie.split('.');
  const mac = fromBase64url(macPart);
  const bytes = fromBase64url(valuePart);
  if (mac?.length !== 32 || !bytes || rest.length) return null;
  const value = new TextDecoder().decode(bytes);
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), mac, message(userId, value));
  return ok ? value : null;
}

/** Reads the cookie from a raw `Cookie` header the way the middleware does. */
export function directCookieFrom(headers: Headers, secureRequest: boolean): string | undefined {
  const jar = new Map<string, string>();
  for (const part of (headers.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return readDirectCookie((n) => jar.get(n), secureRequest);
}

/** `Set-Cookie` for a signed value, or one that deletes the cookie. */
export function directCookieHeader(signed: string | null, secureRequest: boolean): string {
  const name = secureRequest ? DIRECT_COOKIE_SECURE : DIRECT_COOKIE;
  const attrs = `Path=/; HttpOnly; SameSite=Strict${secureRequest ? '; Secure' : ''}`;
  return signed
    ? `${name}=${signed}; Max-Age=${MAX_AGE_SEC}; ${attrs}`
    : `${name}=; Max-Age=0; ${attrs}`;
}
