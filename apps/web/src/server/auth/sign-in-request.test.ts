import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { withoutSessionCookie } from './sign-in-request';

const req = (path: string, cookie: string, init: { method?: string; body?: string } = {}) =>
  new NextRequest(`https://dev.example.test${path}`, { ...init, headers: { cookie } });

const SESSION =
  '__Secure-authjs.session-token=aaa; __Secure-authjs.session-token.0=bbb; authjs.session-token=ccc';

describe('withoutSessionCookie', () => {
  it('drops the session from an OAuth callback, so the new account is never linked', () => {
    const out = withoutSessionCookie(
      req(
        '/api/auth/callback/google?code=x&state=y',
        `${SESSION}; __Secure-authjs.pkce.code_verifier=v`,
      ),
    );
    expect(out.headers.get('cookie')).toBe('__Secure-authjs.pkce.code_verifier=v');
    expect(out.nextUrl.searchParams.get('code')).toBe('x');
  });

  it('drops it from credentials callbacks and keeps the body', async () => {
    const out = withoutSessionCookie(
      req('/api/auth/callback/google-one-tap', SESSION, { method: 'POST', body: 'credential=z' }),
    );
    expect(out.headers.get('cookie')).toBeNull();
    expect(await out.text()).toBe('credential=z');
  });

  it('keeps the session for passkey registration and every other auth route', () => {
    for (const path of ['/api/auth/callback/passkey', '/api/auth/session', '/api/auth/signout']) {
      const r = req(path, SESSION);
      expect(withoutSessionCookie(r)).toBe(r);
    }
  });
});
