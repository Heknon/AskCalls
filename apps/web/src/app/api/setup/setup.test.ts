import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { passwordSignIn, redeemSetupClaim } from '../../../server/auth/local-accounts';
import { ConfigService } from '../../../server/config/config-service';
import { SetupToken } from '../../../server/config/setup-token';
import { getContainer, needsSetup, setContainerForTests } from '../../../server/container';
import { dispatch } from '../../../server/testing/http';

const TOKEN = 'K7Q2M-9XW4R-T3HJP-0VN8C';

const PATCH = {
  db: { driver: 'memory' },
  blob: { driver: 'memory' },
  transcription: { provider: 'none' },
  llm: { provider: 'none' },
  auth: { providers: [], localAccounts: true },
};

function post(path: string, json: unknown) {
  return dispatch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
      body: JSON.stringify(json),
    }),
  );
}

describe('/api/setup', () => {
  let dir: string;
  let configService: ConfigService;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'askcalls-setup-'));
    configService = new ConfigService({ NODE_ENV: 'test', ASKCALLS_DATA_DIR: dir });
    const resolved = await configService.load();
    expect(needsSetup(configService, resolved)).toBe(true);
    setContainerForTests(null, { configService, setup: SetupToken.forTests(TOKEN) });
  });
  afterEach(() => setContainerForTests(null));

  it('needs the setup token on every request', async () => {
    expect((await post('/api/setup', { token: 'WRONG-TOKEN-00000' })).status).toBe(401);
    expect((await post('/api/setup', {})).status).toBe(400);
    const ok = await post('/api/setup', { token: TOKEN.toLowerCase() });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect((await ok.json()).defaults).toEqual({
      pgliteDir: join(dir, 'db'),
      fsDir: join(dir, 'blobs'),
    });
    expect(
      (await post('/api/setup/test', { token: 'nope-nope-nope', port: 'database', patch: {} }))
        .status,
    ).toBe(401);
  });

  it('creates the admin with a password, signs them in once, and closes setup', async () => {
    const res = await post('/api/setup/complete', {
      token: TOKEN,
      patch: PATCH,
      admin: { email: 'Owner@Example.test', password: 'correct horse battery' },
    });
    expect(res.status).toBe(200);
    const { claim } = await res.json();
    const { ports, config } = await getContainer();
    expect(config.config.auth.localAccounts).toBe(true);
    const owner = await ports.users.findByEmail('owner@example.test');
    expect(owner?.role).toBe('admin');
    expect((await passwordSignIn(ports, 'owner@example.test', 'correct horse battery'))?.id).toBe(
      owner?.id,
    );
    expect(await passwordSignIn(ports, 'owner@example.test', 'wrong password!!')).toBeNull();
    expect((await redeemSetupClaim(ports, claim))?.id).toBe(owner?.id);
    expect(await redeemSetupClaim(ports, claim)).toBeNull();
    const file = JSON.parse(await readFile(join(dir, 'config.json'), 'utf8'));
    expect(file.db).toEqual({ driver: 'memory' });
    expect(JSON.stringify(file)).not.toContain('correct horse');

    // Single use: the token is gone, and so is setup.
    const again = await post('/api/setup/complete', {
      token: TOKEN,
      patch: PATCH,
      admin: { email: 'stranger@example.test', password: 'another long password' },
    });
    expect(again.status).toBe(404);
    expect(await ports.users.findByEmail('stranger@example.test')).toBeNull();
  });

  it('rejects a config that would not boot and keeps setup open', async () => {
    const res = await post('/api/setup/complete', {
      token: TOKEN,
      patch: { ...PATCH, db: { driver: 'postgres' } },
      admin: { email: 'owner@example.test', password: 'correct horse battery' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/DATABASE_URL/);
    expect((await post('/api/setup', { token: TOKEN })).status).toBe(200);
  });

  it('needs a password or a passkey for the admin', async () => {
    const res = await post('/api/setup/complete', {
      token: TOKEN,
      patch: PATCH,
      admin: { email: 'owner@example.test' },
    });
    expect(res.status).toBe(400);
  });

  it('issues passkey registration options for the admin', async () => {
    const res = await post('/api/setup/passkey', { token: TOKEN, email: 'owner@example.test' });
    const { options } = await res.json();
    expect(options).toMatchObject({
      rp: { id: 'localhost', name: 'AskCalls' },
      user: { name: 'owner@example.test' },
      authenticatorSelection: { residentKey: 'required' },
    });
    const forged = await post('/api/setup/complete', {
      token: TOKEN,
      patch: PATCH,
      admin: { email: 'owner@example.test', passkey: { id: 'x', rawId: 'x', type: 'public-key' } },
    });
    expect(forged.status).toBe(400);
  });

  it('tests the proposed database before anything is saved', async () => {
    const res = await post('/api/setup/test', {
      token: TOKEN,
      port: 'database',
      patch: { db: { driver: 'pglite' } },
    });
    expect(await res.json()).toMatchObject({ ok: true });
    const bad = await post('/api/setup/test', {
      token: TOKEN,
      port: 'database',
      patch: { db: { driver: 'postgres', url: 'postgres://u:p@127.0.0.1:1/none' } },
    });
    expect(await bad.json()).toMatchObject({ ok: false });
  });
});
