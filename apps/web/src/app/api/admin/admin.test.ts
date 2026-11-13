import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from '../../../server/config/config-service';
import { containerForTests, getContainer, setContainerForTests } from '../../../server/container';
import { AUTH_SECRET, dispatch, sessionCookie } from '../../../server/testing/http';
import { makeTestPorts, type TestPorts } from '../../../server/testing/ports';

const SECRETS = ['sk-ant-file-secret', 'google-client-secret'];

interface Ctx {
  dir: string;
  ports: TestPorts;
  admin: string;
  user: string;
  adminCookie: string;
  userCookie: string;
}

async function start(env: Record<string, string> = {}): Promise<Ctx> {
  const dir = await mkdtemp(join(tmpdir(), 'askcalls-admin-'));
  await writeFile(
    join(dir, 'config.json'),
    JSON.stringify({
      transcription: { provider: 'mock' },
      llm: { provider: 'anthropic', apiKey: SECRETS[0] },
      auth: { providers: ['google'], google: { id: 'gid', secret: SECRETS[1] } },
    }),
  );
  const configService = new ConfigService({
    NODE_ENV: 'test',
    ASKCALLS_DATA_DIR: dir,
    AUTH_SECRET,
    DB_DRIVER: 'memory',
    BLOB_DRIVER: 'memory',
    FREE_TIER_MAX_CALLS: '500',
    ...env,
  });
  const resolved = await configService.load();
  const ports = makeTestPorts();
  setContainerForTests(containerForTests(resolved, ports), { configService });
  const admin = await ports.users.create({ email: 'admin@example.test' });
  await ports.users.setRole(admin.id, 'admin');
  const user = await ports.users.create({ email: 'member@example.test' });
  return {
    dir,
    ports,
    admin: admin.id,
    user: user.id,
    adminCookie: await sessionCookie(admin.id),
    userCookie: await sessionCookie(user.id),
  };
}

function call(method: string, path: string, cookie: string | null, json?: unknown) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (json !== undefined) headers['content-type'] = 'application/json';
  return dispatch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      ...(json !== undefined && { body: JSON.stringify(json) }),
    }),
  );
}

describe('/api/admin', () => {
  let c: Ctx;
  beforeEach(async () => {
    c = await start();
  });
  afterEach(() => setContainerForTests(null));

  it('is for admins only, and never cached', async () => {
    expect((await call('GET', '/api/admin/instance', null)).status).toBe(401);
    expect((await call('GET', '/api/admin/instance', c.userCookie)).status).toBe(403);
    const res = await call('GET', '/api/admin/instance', c.adminCookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await call('PATCH', '/api/admin/instance', c.userCookie, { patch: {} })).status).toBe(
      403,
    );
    expect(
      (await call('POST', '/api/admin/users', c.userCookie, { email: 'member@example.test' }))
        .status,
    ).toBe(403);
  });

  it('never returns a secret, and lists env locks and offline blockers', async () => {
    const res = await call('GET', '/api/admin/instance', c.adminCookie);
    const text = await res.text();
    for (const s of SECRETS) expect(text).not.toContain(s);
    const view = JSON.parse(text);
    expect(view.secrets).toEqual(expect.arrayContaining(['llm.apiKey', 'auth.google.secret']));
    expect(view.locked).toEqual(expect.arrayContaining(['limits.freeTierMaxCalls', 'db.driver']));
    expect(view.offline.blockers.map((b: { id: string }) => b.id)).toEqual([
      'llm',
      'sign-in-google',
      'local-accounts',
    ]);
    expect(view.health.database.status).toBe('healthy');
  });

  it('rejects env-locked settings and keeps secrets the patch leaves out', async () => {
    const locked = await call('PATCH', '/api/admin/instance', c.adminCookie, {
      patch: { limits: { freeTierMaxCalls: 10 } },
    });
    expect(locked.status).toBe(400);
    expect((await locked.json()).error.message).toMatch(/set by the server environment/);

    const res = await call('PATCH', '/api/admin/instance', c.adminCookie, {
      patch: { llm: { model: 'claude-sonnet-4-5' } },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const s of SECRETS) expect(text).not.toContain(s);
    expect(JSON.parse(text).secrets).toContain('llm.apiKey');
    const file = JSON.parse(await readFile(join(c.dir, 'config.json'), 'utf8'));
    expect(file.llm).toEqual({
      provider: 'anthropic',
      apiKey: SECRETS[0],
      model: 'claude-sonnet-4-5',
    });
    // Hot reload: the running container has the new config, and the same database.
    const next = await getContainer();
    expect(next.config.config.llm.model).toBe('claude-sonnet-4-5');
    expect(await next.ports.users.findById(c.admin)).not.toBeNull();
    const events = c.ports.db.audit.filter((e) => e.action === 'instance.update');
    expect(events.map((e) => e.meta.paths)).toEqual(['llm.model']);
  });

  it('reports live health from the rebuilt container after a save', async () => {
    const res = await call('PATCH', '/api/admin/instance', c.adminCookie, {
      patch: { llm: { provider: 'mock' } },
    });
    expect((await res.json()).health.llm).toMatchObject({ status: 'healthy' });
  });

  it('tests a connection with the proposed settings without saving them', async () => {
    const ok = await call('POST', '/api/admin/instance/test', c.adminCookie, {
      port: 'llm',
      patch: { llm: { provider: 'mock' } },
    });
    expect(await ok.json()).toMatchObject({ ok: true });
    expect((await getContainer()).config.config.llm.provider).toBe('anthropic');
    const incomplete = await call('POST', '/api/admin/instance/test', c.adminCookie, {
      port: 'llm',
      patch: { llm: { provider: 'openai-compatible' } },
    });
    expect(await incomplete.json()).toMatchObject({ ok: false, message: 'incomplete' });
  });

  it('refuses offline mode until every blocker is fixed, then enables it', async () => {
    const refused = await call('PATCH', '/api/admin/instance', c.adminCookie, {
      patch: { offlineMode: true },
    });
    expect(refused.status).toBe(409);
    for (const [blocker, fix] of [
      ['llm', 'off'],
      ['sign-in-google', 'off'],
      ['local-accounts', 'local-accounts-on'],
    ]) {
      const res = await call('POST', '/api/admin/instance/offline', c.adminCookie, {
        blocker,
        fix,
      });
      expect(res.status, blocker).toBe(200);
    }
    const view = await (await call('GET', '/api/admin/instance', c.adminCookie)).json();
    expect(view.offline.blockers).toEqual([]);
    const enabled = await call('PATCH', '/api/admin/instance', c.adminCookie, {
      patch: { offlineMode: true },
    });
    expect(enabled.status).toBe(200);
    expect((await enabled.json()).offline.enabled).toBe(true);
    const blocked = await call('POST', '/api/admin/instance/test', c.adminCookie, {
      port: 'transcription',
      patch: {
        transcription: { provider: 'openai-compatible', baseUrl: 'https://api.example.com/v1' },
      },
    });
    expect(await blocked.json()).toMatchObject({ ok: false, message: 'offline_blocked' });
    expect(
      (
        await call('POST', '/api/admin/instance/offline', c.adminCookie, {
          blocker: 'llm',
          fix: 'local-folder',
        })
      ).status,
    ).toBe(404);
  });

  it('allows a database change only while the database is empty', async () => {
    const res = await call('PATCH', '/api/admin/instance', c.adminCookie, {
      patch: { db: { migrateOnBoot: true } },
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(/askcalls backup and restore/);
  });

  it('promotes another user by email, audited on both accounts', async () => {
    const res = await call('POST', '/api/admin/users', c.adminCookie, {
      email: 'Member@Example.test',
    });
    expect(await res.json()).toEqual({ userId: c.user, role: 'admin', alreadyAdmin: false });
    expect((await c.ports.users.findById(c.user))?.role).toBe('admin');
    const grants = c.ports.db.audit.filter((e) => e.action === 'role.grant');
    expect(grants.map((e) => e.userId).sort()).toEqual([c.admin, c.user].sort());
    expect(
      (await call('POST', '/api/admin/users', c.adminCookie, { email: 'nobody@example.test' }))
        .status,
    ).toBe(404);
  });
});

describe('/api/admin on the hosted instance', () => {
  afterEach(() => setContainerForTests(null));

  it('shows the instance read-only', async () => {
    const c = await start({ ASKCALLS_HOSTED: 'true' });
    const view = await (await call('GET', '/api/admin/instance', c.adminCookie)).json();
    expect(view.hosted).toBe(true);
    const res = await call('PATCH', '/api/admin/instance', c.adminCookie, {
      patch: { llm: { provider: 'mock' } },
    });
    expect(res.status).toBe(403);
  });
});
