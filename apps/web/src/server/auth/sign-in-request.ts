import { NextRequest } from 'next/server';
import { SESSION_COOKIES } from './secret';

const CALLBACK = /\/api\/auth\/callback\/([^/?]+)/;

/**
 * A sign-in callback without the current session cookie. Auth.js links a new OAuth account to
 * whoever is signed in when the callback arrives, so signing in with a second Google account
 * from a browser still holding a session would attach it to the first user for good. AskCalls
 * has no account linking: every callback is a fresh sign-in. Passkey callbacks keep the cookie,
 * since registering a passkey adds it to the signed-in local account.
 */
export function withoutSessionCookie(req: NextRequest): NextRequest {
  const provider = CALLBACK.exec(req.nextUrl.pathname)?.[1];
  if (!provider || provider === 'passkey') return req;
  const cookie = req.headers.get('cookie');
  if (!cookie) return req;
  const kept = cookie
    .split(';')
    .map((c) => c.trim())
    .filter((c) => {
      const eq = c.indexOf('=');
      const name = eq < 0 ? c : c.slice(0, eq);
      return !SESSION_COOKIES.some((s) => name === s || name.startsWith(`${s}.`));
    });
  const headers = new Headers(req.headers);
  if (kept.length) headers.set('cookie', kept.join('; '));
  else headers.delete('cookie');
  return new NextRequest(req.url, {
    method: req.method,
    headers,
    body: req.body,
    // Streams need half duplex in undici.
    ...(req.body && { duplex: 'half' }),
  } as ConstructorParameters<typeof NextRequest>[1]);
}
