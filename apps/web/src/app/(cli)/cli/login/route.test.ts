import { listKeyring } from '@askcalls/api-contract/routes/keyring';
import { listTokens } from '@askcalls/api-contract/routes/tokens';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessionCookie, startTestApp, type TestApp } from '../../../../server/testing/http';
import { GET, POST } from './route';

const APP = 'http://localhost:3000';
const STATE = 'Q'.repeat(43);
let app: TestApp;
let cookie: string;

const consent = (headers: Record<string, string>, form: Record<string, string>) =>
  POST(
    new Request(`${APP}/cli/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(form).toString(),
    }),
  );

beforeAll(async () => {
  app = startTestApp();
  const user = await app.ports.users.create({ email: 'cli@example.test' });
  cookie = await sessionCookie(user.id);
});
afterAll(() => app.close());

describe('/cli/login (askcalls login)', () => {
  it('sends a signed-out browser to sign in and back', async () => {
    const res = await GET(new Request(`${APP}/cli/login?port=4555&state=${STATE}`));
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get('location')!);
    expect(to.pathname).toBe('/login');
    expect(to.searchParams.get('callbackUrl')).toBe(`/cli/login?port=4555&state=${STATE}`);
  });

  it('rejects malformed ports and states', async () => {
    for (const q of ['port=80&state=' + STATE, 'port=4555&state=short', 'state=' + STATE]) {
      const res = await GET(new Request(`${APP}/cli/login?${q}`, { headers: { cookie } }));
      expect(res.status).toBe(400);
    }
  });

  it('asks for consent with a same-origin form and a strict CSP', async () => {
    const res = await GET(
      new Request(`${APP}/cli/login?port=4555&state=${STATE}`, { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("default-src 'none'");
    const html = await res.text();
    expect(html).toContain('action="/cli/login"');
    expect(html).toContain('127.0.0.1:4555');
    expect(html).not.toMatch(/ac_[A-Za-z0-9_-]{43}/);
  });

  it('refuses a cross-site or signed-out consent', async () => {
    const form = { port: '4555', state: STATE };
    expect((await consent({ cookie, origin: 'https://evil.example' }, form)).status).toBe(403);
    expect((await consent({ cookie }, form)).status).toBe(403);
    expect((await consent({ origin: APP }, form)).status).toBe(401);
    expect((await consent({ cookie, origin: APP }, { port: '4555', state: 'x' })).status).toBe(400);
  });

  it('creates a read write ask keys token and hands it only to the loopback port', async () => {
    const res = await consent({ cookie, origin: APP }, { port: '4555', state: STATE });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toContain('form-action http://127.0.0.1:4555/callback');
    const nonce = csp.match(/script-src 'nonce-([^']+)'/)![1];
    const html = await res.text();
    expect(html).toContain('action="http://127.0.0.1:4555/callback"');
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).toContain(`name="state" value="${STATE}"`);
    const token = html.match(/name="token" value="(ac_[A-Za-z0-9_-]{43})"/)![1]!;

    await app.client({ token }).request(listKeyring, {});
    const { items } = await app.client({ cookie }).request(listTokens, {});
    expect(items.map((t) => [t.name, [...t.scopes].sort(), t.expiresAt])).toEqual([
      ['askcalls CLI', ['ask', 'keys', 'read', 'write'], null],
    ]);
  });
});
