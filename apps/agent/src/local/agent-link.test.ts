import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listKeyring } from '@askcalls/api-contract/routes/keyring';
import { listTokens } from '@askcalls/api-contract/routes/tokens';
import { Onboarding } from '@askcalls/client-core';
import { FakeAudioCodec, MemorySecretStore } from '@askcalls/client-core/testing/fakes';
import { beforeEach, describe, expect, it } from 'vitest';
import { linkLocalAgent } from '../../../web/src/client/local-agent-link';
import {
  type ClientDevice,
  type ClientHarness,
  startClientHarness,
} from '../../../web/src/server/testing/client';
import { dispatch } from '../../../web/src/server/testing/http';
import { type AgentDeps, isLinked, openAccount, unlockAgent } from '../agent';
import { loadConfig } from '../config';
import { startLocalAgentLink } from './agent-link';

/** The web app's APP_URL in the test container: plays the local instance's origin. */
const ORIGIN = 'http://localhost:3000';

let h: ClientHarness;
let browser: ClientDevice;
let dir: string;
let secrets: MemorySecretStore;
let deps: AgentDeps;

/** The browser's fetch: it sends the page's Origin with every request to the listener. */
const browserFetch = (async (url: string, init: RequestInit = {}) =>
  fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), origin: ORIGIN },
  })) as typeof fetch;

beforeEach(async () => {
  h = await startClientHarness();
  browser = h.browser();
  const o = await Onboarding.begin(h.userId);
  await o.addPasskey(h.passkeys, { userName: 'owner', label: 'Laptop passkey' });
  const [g1, g2] = o.confirmationGroups;
  o.confirmRecovery({ [g1]: o.recoveryGroups[g1]!, [g2]: o.recoveryGroups[g2]! });
  await o.finish({
    api: browser.ctx.api,
    session: browser.session,
    deviceKeys: browser.deviceKeys,
    deviceLabel: 'Laptop',
  });
  dir = await mkdtemp(join(tmpdir(), 'askcalls-local-link-'));
  secrets = new MemorySecretStore();
  deps = {
    dir,
    secrets: { store: secrets, kind: 'keychain' },
    fetch: (url, init) => dispatch(new Request(url, init)),
    embedder: h.embedder,
    audio: new FakeAudioCodec(),
  };
});

const listen = () =>
  startLocalAgentLink({
    origin: ORIGIN,
    dir,
    secrets,
    deviceLabel: 'askcalls agent',
    deps,
    pollMs: 20,
  });

describe('local-mode agent link (browser ↔ askcalls local)', () => {
  it('links the agent after unlock: token, RK and server, without login or link', async () => {
    const listener = await listen();
    expect(listener.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/link\/[A-Za-z0-9_-]{43}$/);
    const result = await linkLocalAgent({
      url: listener.url,
      api: browser.ctx.api,
      session: browser.session,
      fetch: browserFetch,
      pollMs: 20,
    });
    expect(result).toBe('linked');
    await listener.linked;
    expect(listener.state()).toBe('linked');
    expect(await isLinked(secrets)).toBe(true);
    expect((await loadConfig(dir)).server).toBe(ORIGIN);

    const agent = await unlockAgent(await openAccount(deps), deps);
    expect(agent.session.userId).toBe(h.userId);
    const api = h.app.client({ cookie: h.cookie });
    expect((await api.request(listTokens, {})).items.map((t) => t.name)).toEqual([
      'askcalls agent (this computer)',
    ]);
    const keyring = await api.request(listKeyring, {});
    expect(keyring.devices.map((d) => d.label)).toContain('askcalls agent');
    expect(keyring.entries.filter((e) => e.kind === 'device').map((e) => e.label)).toEqual([
      'askcalls agent',
    ]);

    expect(
      await linkLocalAgent({
        url: listener.url,
        api: browser.ctx.api,
        session: browser.session,
        fetch: browserFetch,
      }),
    ).toBe('not-waiting');
    listener.close();
  });

  it('sends no RK when the fingerprints differ', async () => {
    const listener = await listen();
    const lying = (async (url: string, init: RequestInit = {}) => {
      const res = await browserFetch(url, init);
      if (init.method !== 'POST') return res;
      const { fingerprint } = (await res.json()) as { fingerprint: string };
      const wrong = String((Number(fingerprint) + 1) % 1_000_000).padStart(6, '0');
      return Response.json({ fingerprint: wrong });
    }) as typeof fetch;
    expect(
      await linkLocalAgent({
        url: listener.url,
        api: browser.ctx.api,
        session: browser.session,
        fetch: lying,
        pollMs: 20,
      }),
    ).toBe('mismatch');
    expect(await isLinked(secrets)).toBe(false);
    listener.close();
  });

  it('answers only the app origin at its nonce path, and accepts one link', async () => {
    const listener = await listen();
    const base = new URL(listener.url);
    expect((await fetch(listener.url)).status).toBe(404);
    expect((await fetch(listener.url, { headers: { origin: 'http://evil.example' } })).status).toBe(
      404,
    );
    expect((await browserFetch(`${base.origin}/link/${'x'.repeat(43)}`, {})).status).toBe(404);
    const pre = await fetch(listener.url, { method: 'OPTIONS', headers: { origin: ORIGIN } });
    expect(pre.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const post = (body: unknown) =>
      browserFetch(listener.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect((await post({ token: 'nope', code: 'x' })).status).toBe(400);
    expect((await post({ token: `ac_${'a'.repeat(43)}`, code: 'c'.repeat(40) })).status).toBe(401);
    expect(listener.state()).toBe('failed');
    expect((await post({ token: `ac_${'a'.repeat(43)}`, code: 'c'.repeat(40) })).status).toBe(409);
    await expect(listener.linked).rejects.toThrow();
    listener.close();
  });
});
