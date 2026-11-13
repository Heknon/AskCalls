import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, ConfigService } from './config-service';

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'askcalls-config-'));
}

describe('ConfigService', () => {
  it('boots a fresh server instance into setup with only the data dir locked', async () => {
    const svc = new ConfigService({ ASKCALLS_DATA_DIR: await tempDir() });
    const r = await svc.load();
    expect(svc.isFresh).toBe(true);
    expect([...r.locked]).toEqual(['dataDir']);
    expect(r.incomplete).toEqual([
      'DATABASE_URL: required when DB_DRIVER=postgres',
      'S3_BUCKET: required when BLOB_DRIVER=s3',
    ]);
  });

  it('uses working local defaults in local mode', async () => {
    const r = await new ConfigService({
      APP_MODE: 'local',
      ASKCALLS_DATA_DIR: await tempDir(),
    }).load();
    expect(r.config.db.driver).toBe('pglite');
    expect(r.config.blob.driver).toBe('fs');
    expect(r.incomplete).toEqual([]);
  });

  it('locks every setting given by env', async () => {
    const r = await new ConfigService({
      ASKCALLS_DATA_DIR: await tempDir(),
      DB_DRIVER: 'memory',
      BLOB_DRIVER: 'memory',
      TELEMETRY: 'none',
      FREE_TIER_MAX_CALLS: '42',
    }).load();
    expect(r.config.limits.freeTierMaxCalls).toBe(42);
    expect(r.config.telemetry.backends).toEqual([]);
    expect([...r.locked].sort()).toEqual([
      'blob.driver',
      'dataDir',
      'db.driver',
      'limits.freeTierMaxCalls',
      'telemetry.backends',
    ]);
  });

  it('fails fast listing every invalid env value', async () => {
    const svc = new ConfigService({
      ASKCALLS_DATA_DIR: await tempDir(),
      OFFLINE_MODE: 'yes',
      DB_DRIVER: 'mysql',
      FREE_TIER_MAX_CALLS: 'many',
    });
    await expect(svc.load()).rejects.toBeInstanceOf(ConfigError);
    await svc.load().catch((e: ConfigError) => {
      expect(e.problems.join('\n')).toMatch(/OFFLINE_MODE/);
      expect(e.problems.join('\n')).toMatch(/FREE_TIER_MAX_CALLS/);
    });
  });

  it('fails fast when env sets an incomplete combination', async () => {
    const svc = new ConfigService({
      ASKCALLS_DATA_DIR: await tempDir(),
      DB_DRIVER: 'postgres',
      BLOB_DRIVER: 'memory',
    });
    await expect(svc.load()).rejects.toThrow(/DATABASE_URL/);
  });

  it('writes updates owner-only, rejects locked paths, notifies and redacts secrets', async () => {
    const dir = await tempDir();
    const svc = new ConfigService({ ASKCALLS_DATA_DIR: dir, BLOB_DRIVER: 'memory' });
    await svc.load();
    let notified = 0;
    svc.subscribe(() => notified++);
    const r = await svc.update({ db: { driver: 'postgres', url: 'postgres://u:p@db/askcalls' } });
    expect(r.incomplete).toEqual([]);
    expect(notified).toBe(1);
    const file = join(dir, 'config.json');
    expect(JSON.parse(await readFile(file, 'utf8')).db.url).toBe('postgres://u:p@db/askcalls');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await expect(svc.update({ blob: { driver: 'fs' } })).rejects.toThrow(
      /set by the server environment/,
    );
    expect(JSON.stringify(svc.redacted())).not.toContain('u:p@db');
    const reloaded = await new ConfigService({
      ASKCALLS_DATA_DIR: dir,
      BLOB_DRIVER: 'memory',
    }).load();
    expect(reloaded.config.db.driver).toBe('postgres');
  });

  it('refuses edits on the hosted instance', async () => {
    const svc = new ConfigService({
      ASKCALLS_DATA_DIR: await tempDir(),
      ASKCALLS_HOSTED: 'true',
      DB_DRIVER: 'memory',
      BLOB_DRIVER: 'memory',
    });
    await svc.load();
    await expect(svc.update({ llm: { provider: 'mock' } })).rejects.toThrow(/hosted/);
  });

  it('returns no secret values to the admin UI, only which are set', async () => {
    const svc = new ConfigService({
      ASKCALLS_DATA_DIR: await tempDir(),
      DB_DRIVER: 'postgres',
      DATABASE_URL: 'postgres://askcalls:pg-secret@db:5432/askcalls',
      BLOB_DRIVER: 'memory',
      ANTHROPIC_API_KEY: 'sk-ant-api-secret',
      AUTH_GITHUB_SECRET: 'gh-secret',
    });
    await svc.load();
    await svc.update({ transcription: { keys: { elevenlabs: 'xi-secret' } } });
    const view = svc.redacted();
    const json = JSON.stringify(view);
    for (const secret of ['pg-secret', 'sk-ant-api-secret', 'gh-secret', 'xi-secret']) {
      expect(json).not.toContain(secret);
    }
    expect(view.secrets.sort()).toEqual(
      ['auth.github.secret', 'db.url', 'llm.apiKey', 'transcription.keys.elevenlabs'].sort(),
    );
    expect((view.config.db as { urlDisplay: string }).urlDisplay).toBe(
      'postgres://askcalls@db:5432/askcalls',
    );
  });

  it('removes a setting patched to null and rejects patches that would not boot', async () => {
    const dir = await tempDir();
    const svc = new ConfigService({
      ASKCALLS_DATA_DIR: dir,
      DB_DRIVER: 'memory',
      BLOB_DRIVER: 'memory',
    });
    await svc.load();
    await svc.update({ embeddingModelUrl: 'https://models.example.com/e5' });
    await svc.update({ embeddingModelUrl: null });
    expect(svc.get().config.embeddingModelUrl).toBeUndefined();
    expect(JSON.parse(await readFile(join(dir, 'config.json'), 'utf8'))).not.toHaveProperty(
      'embeddingModelUrl',
    );
    await expect(svc.update({ blob: { driver: 'fs' }, db: { url: null } })).rejects.toThrow(
      /set by the server environment/,
    );
    const open = new ConfigService({ ASKCALLS_DATA_DIR: await tempDir(), BLOB_DRIVER: 'memory' });
    await open.load();
    await expect(open.update({ db: { driver: 'postgres' } })).rejects.toThrow(/DATABASE_URL/);
    expect(
      open.preview({ db: { driver: 'postgres' } }, { allowIncomplete: true }).incomplete,
    ).toEqual(['DATABASE_URL: required when DB_DRIVER=postgres']);
  });

  it('refuses offline mode while a setting reaches the internet', async () => {
    const svc = new ConfigService({
      ASKCALLS_DATA_DIR: await tempDir(),
      DB_DRIVER: 'memory',
      BLOB_DRIVER: 'memory',
    });
    await svc.load();
    await svc.update({ auth: { providers: ['google'], localAccounts: true } });
    await expect(svc.update({ offlineMode: true })).rejects.toThrow(/accounts\.google\.com/);
    await svc.update({
      auth: { providers: [] },
      llm: { provider: 'none' },
      transcription: { provider: 'none' },
    });
    expect((await svc.update({ offlineMode: true })).config.offlineMode).toBe(true);
  });
});
