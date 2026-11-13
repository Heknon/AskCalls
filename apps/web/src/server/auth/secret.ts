import { getToken } from 'next-auth/jwt';
import type { ResolvedConfig } from '../config/config-service';

/** Auth.js session cookie names: `__Secure-` over HTTPS, plain over HTTP (local dev). */
export const SESSION_COOKIES = ['__Secure-authjs.session-token', 'authjs.session-token'] as const;

const g = globalThis as typeof globalThis & { __askcallsDevAuthSecret?: string };

/**
 * The secret that encrypts session JWTs. Outside production an unset AUTH_SECRET falls back to
 * a random per-process secret (sessions end on restart); production without one has no
 * sign-in at all (fails closed).
 */
export function authSecret(resolved: ResolvedConfig): string | null {
  if (resolved.config.auth.secret) return resolved.config.auth.secret;
  if (resolved.environment === 'production') return null;
  g.__askcallsDevAuthSecret ??= btoa(
    String.fromCharCode(...globalThis.crypto.getRandomValues(new Uint8Array(32))),
  );
  return g.__askcallsDevAuthSecret;
}

/**
 * Reads the signed-in user id from the session cookie only (never from Authorization, which
 * carries personal access tokens). Null when absent, expired or not decryptable.
 */
export async function readSessionUserId(
  headers: Headers,
  resolved: ResolvedConfig,
): Promise<string | null> {
  const secret = authSecret(resolved);
  const cookie = headers.get('cookie');
  if (!secret || !cookie) return null;
  for (const cookieName of SESSION_COOKIES) {
    if (!cookie.includes(cookieName)) continue;
    const token = await getToken({
      req: { headers: { cookie } },
      secret,
      cookieName,
      salt: cookieName,
      secureCookie: cookieName.startsWith('__Secure-'),
    });
    if (token && typeof token.sub === 'string') return token.sub;
  }
  return null;
}
