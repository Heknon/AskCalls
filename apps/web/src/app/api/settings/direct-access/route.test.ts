import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { middleware } from '../../../../middleware';
import { signDirectCookie } from '../../../../server/http/direct-access';
import {
  AUTH_SECRET,
  sessionCookie,
  startTestApp,
  type TestApp,
} from '../../../../server/testing/http';

let app: TestApp;
afterEach(() => app?.close());

const OWN = 'https://my-calls.s3.eu-central-1.amazonaws.com';

async function connectSrc(cookie: string): Promise<string> {
  const res = await middleware(new NextRequest('http://localhost/app', { headers: { cookie } }));
  const csp = res.headers.get('content-security-policy') ?? '';
  return csp.split('; ').find((d) => d.startsWith('connect-src ')) ?? '';
}

/** The `name=value` pair of a Set-Cookie header. */
const pair = (setCookie: string | null) => setCookie?.split(';')[0] ?? '';

describe('direct-access cookie', () => {
  it('is set HttpOnly by the server and widens connect-src only for its user', async () => {
    app = startTestApp();
    const a = await app.ports.users.create({ email: 'a@example.test' });
    const b = await app.ports.users.create({ email: 'b@example.test' });
    const session = await sessionCookie(a.id);
    const put = (cookie: string, body: unknown) =>
      app.req('PUT', '/api/settings/direct-access', { as: { cookie }, json: body });

    const res = await put(session, { providers: ['openai'], origins: [`${OWN}/x`] });
    expect(await res.json()).toEqual({ changed: true });
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(
      /^askcalls-direct=.+; Max-Age=\d+; Path=\/; HttpOnly; SameSite=Strict$/,
    );
    const direct = pair(setCookie);

    const same = await put(`${session}; ${direct}`, { providers: ['openai'], origins: [OWN] });
    expect(await same.json()).toEqual({ changed: false });

    const allowed = await connectSrc(`${session}; ${direct}`);
    expect(allowed).toContain('https://api.openai.com');
    expect(allowed).toContain(OWN);

    expect(await connectSrc(`${await sessionCookie(b.id)}; ${direct}`)).toBe("connect-src 'self'");
  });

  it('ignores a cookie written by script or tampered with', async () => {
    app = startTestApp();
    const a = await app.ports.users.create({ email: 'a@example.test' });
    const session = await sessionCookie(a.id);
    const value = 'p=openai&o=https%3A%2F%2Fevil.example';

    expect(await connectSrc(`${session}; askcalls-direct=${value}`)).toBe("connect-src 'self'");
    const signed = await signDirectCookie(AUTH_SECRET, a.id, 'p=openai');
    const b64url = btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const widened = `${signed.split('.')[0]}.${b64url}`;
    expect(await connectSrc(`${session}; askcalls-direct=${widened}`)).toBe("connect-src 'self'");
    const otherSecret = await signDirectCookie('another-secret', a.id, value);
    expect(await connectSrc(`${session}; askcalls-direct=${otherSecret}`)).toBe(
      "connect-src 'self'",
    );
    expect(await connectSrc(`${session}; askcalls-direct=${signed}`)).toBe(
      "connect-src 'self' https://api.openai.com",
    );
  });

  it('clears the cookie for empty lists', async () => {
    app = startTestApp();
    const a = await app.ports.users.create({ email: 'a@example.test' });
    const res = await app.req('PUT', '/api/settings/direct-access', {
      as: { cookie: await sessionCookie(a.id) },
      json: { providers: [], origins: [] },
    });
    expect(await res.json()).toEqual({ changed: false });
    expect(res.headers.get('set-cookie')).toMatch(/^askcalls-direct=; Max-Age=0;/);
  });
});
