import { afterEach, describe, expect, it, vi } from 'vitest';
import { pkceChallenge, signFlow, verifyFlow } from '../../../server/storage/google';
import {
  AUTH_SECRET,
  sessionCookie,
  startTestApp,
  type TestApp,
} from '../../../server/testing/http';

const GOOGLE = { STORAGE_GOOGLE_ID: 'drive-client', STORAGE_GOOGLE_SECRET: 'drive-secret' };
const REFRESH = 'rt-0123456789-secret';
const ACCESS = 'ya29.access-0123456789';
const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';

let app: TestApp;
afterEach(() => {
  app?.close();
  vi.restoreAllMocks();
});

type Seen = { url: string; form: URLSearchParams };

/** Stands in for oauth2.googleapis.com; every other request fails the test. */
function fakeGoogle(answer: (s: Seen) => Response): Seen[] {
  const seen: Seen[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('https://oauth2.googleapis.com/')) throw new Error(`unexpected ${url}`);
    const s = { url, form: new URLSearchParams(String(init?.body ?? '')) };
    seen.push(s);
    return answer(s);
  });
  return seen;
}

const cookiePair = (setCookie: string | null) => setCookie?.split(';')[0] ?? '';

async function connect(cookie: string, ticket = 't'.repeat(24)) {
  const res = await app.req('GET', `/api/storage/connect/google?ticket=${ticket}`, {
    as: { cookie },
  });
  const location = new URL(res.headers.get('location') ?? 'http://x');
  return { res, location, flow: cookiePair(res.headers.get('set-cookie')) };
}

describe('Google Drive OAuth', () => {
  it('redirects to Google with state, PKCE and only drive.file', async () => {
    app = startTestApp({ env: GOOGLE });
    const u = await app.ports.users.create({ email: 'a@example.test' });
    const { res, location, flow } = await connect(await sessionCookie(u.id));
    expect(res.status).toBe(302);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(location.origin + location.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    const q = location.searchParams;
    expect(q.get('client_id')).toBe('drive-client');
    expect(q.get('scope')).toBe(DRIVE_FILE);
    expect(q.get('redirect_uri')).toBe('http://localhost:3000/api/storage/callback/google');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.headers.get('set-cookie')).toMatch(
      /^askcalls-storage-oauth=[^;]+; Max-Age=600; Path=\/api\/storage\/callback; HttpOnly; SameSite=Lax$/,
    );
    expect(flow).not.toContain('drive-secret');
  });

  it('falls back to the sign-in client, and is off without one or in offline mode', async () => {
    app = startTestApp({ env: { AUTH_GOOGLE_ID: 'signin', AUTH_GOOGLE_SECRET: 's' } });
    const u = await app.ports.users.create({ email: 'a@example.test' });
    const cookie = await sessionCookie(u.id);
    expect((await connect(cookie)).location.searchParams.get('client_id')).toBe('signin');
    const me = await (await app.req('GET', '/api/me', { as: { cookie } })).json();
    expect(me.features.storage).toEqual({ googleDrive: true });
    app.close();

    app = startTestApp();
    const v = await app.ports.users.create({ email: 'b@example.test' });
    const none = await connect(await sessionCookie(v.id));
    expect(none.res.status).toBe(404);
    app.close();

    app = startTestApp({
      env: { ...GOOGLE, OFFLINE_MODE: 'true', AUTH_LOCAL_ACCOUNTS: 'true', AUTH_PROVIDERS: 'none' },
    });
    const w = await app.ports.users.create({ email: 'c@example.test' });
    expect((await connect(await sessionCookie(w.id))).res.status).toBe(404);
  });

  it('needs a session', async () => {
    app = startTestApp({ env: GOOGLE });
    const res = await app.req('GET', `/api/storage/connect/google?ticket=${'t'.repeat(24)}`);
    expect(res.status).toBe(401);
  });

  it('exchanges the code with the verifier and posts the tokens to the opener only', async () => {
    app = startTestApp({ env: GOOGLE });
    const u = await app.ports.users.create({ email: 'a@example.test' });
    const cookie = await sessionCookie(u.id);
    const ticket = 'k'.repeat(24);
    const { location, flow } = await connect(cookie, ticket);
    const seen = fakeGoogle(() =>
      Response.json({
        access_token: ACCESS,
        refresh_token: REFRESH,
        expires_in: 3599,
        scope: DRIVE_FILE,
      }),
    );
    const state = location.searchParams.get('state')!;
    const res = await app.req(
      'GET',
      `/api/storage/callback/google?code=c0de&state=${state}&scope=${encodeURIComponent(DRIVE_FILE)}`,
      { as: { cookie: `${cookie}; ${flow}` } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const csp = res.headers.get('content-security-policy') ?? '';
    const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
    expect(csp).toContain("default-src 'none'");
    expect(res.headers.get('set-cookie')).toMatch(/^askcalls-storage-oauth=; Max-Age=0/);
    const html = await res.text();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).toContain('window.opener.postMessage(m,location.origin)');
    expect(html).toContain(REFRESH);
    expect(html).toContain(ticket);

    expect(seen).toHaveLength(1);
    const form = seen[0]!.form;
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('client_secret')).toBe('drive-secret');
    const verifier = form.get('code_verifier')!;
    expect(await pkceChallenge(verifier)).toBe(location.searchParams.get('code_challenge'));

    const stored = JSON.stringify([app.ports.db.audit, app.ports.recordedTelemetry]);
    expect(stored).not.toContain(REFRESH);
    expect(stored).not.toContain(ACCESS);
    expect(app.ports.db.audit.some((e) => e.action === 'storage.link')).toBe(true);
  });

  it('refuses a wrong state, another user, an expired flow or a missing scope', async () => {
    app = startTestApp({ env: GOOGLE });
    const a = await app.ports.users.create({ email: 'a@example.test' });
    const b = await app.ports.users.create({ email: 'b@example.test' });
    const cookieA = await sessionCookie(a.id);
    const { location, flow } = await connect(cookieA);
    const state = location.searchParams.get('state')!;
    const seen = fakeGoogle(() =>
      Response.json({ access_token: ACCESS, refresh_token: REFRESH, scope: 'openid' }),
    );
    const callback = (cookie: string, s: string) =>
      app.req('GET', `/api/storage/callback/google?code=c&state=${s}`, { as: { cookie } });

    expect(await (await callback(`${cookieA}; ${flow}`, 'forged')).text()).toContain('var m=null');
    const other = await callback(`${await sessionCookie(b.id)}; ${flow}`, state);
    expect(await other.text()).toContain('var m=null');
    expect(seen).toHaveLength(0);

    const scope = await (await callback(`${cookieA}; ${flow}`, state)).text();
    expect(scope).toContain('"error":"scope"');
    expect(scope).not.toContain(REFRESH);

    const now = app.ports.clock.now().getTime();
    const value = flow.split('=')[1];
    expect(await verifyFlow(AUTH_SECRET, a.id, value, now)).not.toBeNull();
    expect(await verifyFlow(AUTH_SECRET, a.id, value, now + 11 * 60_000)).toBeNull();
    const signed = await signFlow(AUTH_SECRET, a.id, {
      state: 's',
      verifier: 'v',
      ticket: 't'.repeat(24),
      expiresAt: now + 1000,
    });
    expect(await verifyFlow(AUTH_SECRET, b.id, signed, now)).toBeNull();
    expect(await verifyFlow('another-secret', a.id, signed, now)).toBeNull();
  });

  it('tells the opener when the user declined', async () => {
    app = startTestApp({ env: GOOGLE });
    const u = await app.ports.users.create({ email: 'a@example.test' });
    const cookie = await sessionCookie(u.id);
    const { location, flow } = await connect(cookie);
    const res = await app.req(
      'GET',
      `/api/storage/callback/google?error=access_denied&state=${location.searchParams.get('state')}`,
      { as: { cookie: `${cookie}; ${flow}` } },
    );
    expect(await res.text()).toContain('"error":"denied"');
  });
});

describe('POST /api/storage/token/google', () => {
  const body = (action: 'refresh' | 'revoke') => ({ action, refreshToken: REFRESH });

  it('trades a refresh token for an access token without keeping either', async () => {
    app = startTestApp({ env: GOOGLE });
    const u = await app.ports.users.create({ email: 'a@example.test' });
    const seen = fakeGoogle(() => Response.json({ access_token: ACCESS, expires_in: 3599 }));
    const log = vi.spyOn(console, 'log');
    const err = vi.spyOn(console, 'error');
    const res = await app.req('POST', '/api/storage/token/google', {
      as: { cookie: await sessionCookie(u.id) },
      json: body('refresh'),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      action: 'refresh',
      accessToken: ACCESS,
      expiresInSec: 3599,
    });
    expect(seen[0]!.form.get('refresh_token')).toBe(REFRESH);
    expect(seen[0]!.form.get('client_secret')).toBe('drive-secret');
    const kept = JSON.stringify([app.ports.db.audit, app.ports.recordedTelemetry]);
    expect(kept).not.toContain(REFRESH);
    expect(kept).not.toContain(ACCESS);
    for (const call of [...log.mock.calls, ...err.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(REFRESH);
    }
  });

  it('needs a session or a token', async () => {
    app = startTestApp({ env: GOOGLE });
    fakeGoogle(() => Response.json({ access_token: ACCESS, expires_in: 3599 }));
    expect(
      (await app.req('POST', '/api/storage/token/google', { json: body('refresh') })).status,
    ).toBe(401);
  });

  it('maps a refused refresh token to 403 with a content-free body', async () => {
    app = startTestApp({ env: GOOGLE });
    const u = await app.ports.users.create({ email: 'a@example.test' });
    fakeGoogle(() => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    const res = await app.req('POST', '/api/storage/token/google', {
      as: { cookie: await sessionCookie(u.id) },
      json: body('refresh'),
    });
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain(REFRESH);
  });

  it('revokes and audits without the token', async () => {
    app = startTestApp({ env: GOOGLE });
    const u = await app.ports.users.create({ email: 'a@example.test' });
    const seen = fakeGoogle(() => new Response(null, { status: 200 }));
    const res = await app.req('POST', '/api/storage/token/google', {
      as: { cookie: await sessionCookie(u.id) },
      json: body('revoke'),
    });
    expect(await res.json()).toEqual({ action: 'revoke', revoked: true });
    expect(seen[0]!.url).toBe('https://oauth2.googleapis.com/revoke');
    const unlink = app.ports.db.audit.find((e) => e.action === 'storage.unlink');
    expect(unlink?.meta).toEqual({ provider: 'google' });
    expect(JSON.stringify(app.ports.db.audit)).not.toContain(REFRESH);
  });

  it('is rate-limited per user', async () => {
    app = startTestApp({ env: GOOGLE });
    const u = await app.ports.users.create({ email: 'a@example.test' });
    fakeGoogle(() => Response.json({ access_token: ACCESS, expires_in: 3599 }));
    const cookie = await sessionCookie(u.id);
    let last = 0;
    for (let i = 0; i < 121; i++) {
      last = (
        await app.req('POST', '/api/storage/token/google', {
          as: { cookie },
          json: body('refresh'),
        })
      ).status;
    }
    expect(last).toBe(429);
  });
});
