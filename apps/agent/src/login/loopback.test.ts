import { afterEach, describe, expect, it } from 'vitest';
import { type LoopbackLogin, startLoopbackLogin } from './loopback';

const SERVER = 'https://askcalls.example';
const TOKEN = `ac_${'a'.repeat(43)}`;

let login: LoopbackLogin | null = null;
afterEach(() => login?.close());

const post = (l: LoopbackLogin, form: Record<string, string>, origin: string | null = SERVER) =>
  fetch(`http://127.0.0.1:${l.port}/callback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(origin && { origin }),
    },
    body: new URLSearchParams(form).toString(),
  });

describe('login loopback', () => {
  it('listens on 127.0.0.1 and points the browser at the server page with port and state', async () => {
    login = await startLoopbackLogin({ serverOrigin: SERVER });
    const url = new URL(login.authorizeUrl);
    expect(url.origin).toBe(SERVER);
    expect(url.pathname).toBe('/cli/login');
    expect(url.searchParams.get('port')).toBe(String(login.port));
    expect(url.searchParams.get('state')).toBe(login.state);
    expect(login.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('rejects a mismatched state, a foreign origin and other requests, and keeps waiting', async () => {
    login = await startLoopbackLogin({ serverOrigin: SERVER });
    const wrongState = await post(login, {
      state: `${login.state.startsWith('x') ? 'y' : 'x'}${login.state.slice(1)}`,
      token: TOKEN,
    });
    expect(wrongState.status).toBe(400);
    expect(await wrongState.text()).not.toContain(TOKEN);
    expect(
      (await post(login, { state: login.state, token: TOKEN }, 'https://evil.example')).status,
    ).toBe(403);
    expect((await post(login, { state: login.state, token: 'not-a-token' })).status).toBe(400);
    expect((await fetch(`http://127.0.0.1:${login.port}/callback`)).status).toBe(404);

    const ok = await post(login, { state: login.state, token: TOKEN });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(await login.token).toBe(TOKEN);
  });

  it('accepts the state once: the listener is gone after the first valid callback', async () => {
    login = await startLoopbackLogin({ serverOrigin: SERVER });
    expect((await post(login, { state: login.state, token: TOKEN })).status).toBe(200);
    await login.token;
    const again = await post(login, { state: login.state, token: TOKEN }).then(
      (r) => r.status,
      () => 'refused',
    );
    expect([410, 'refused']).toContain(again);
  });

  it('gives up after the timeout', async () => {
    login = await startLoopbackLogin({ serverOrigin: SERVER, timeoutMs: 20 });
    await expect(login.token).rejects.toThrow(/timed out/);
  });
});
