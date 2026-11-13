import { describe, expect, it } from 'vitest';
import { guardedFetch, OfflineBlockedError } from '../http/offline-fetch';
import { ConfigError, ConfigService } from './config-service';
import { fixPatch, isLocalHost, offlineBlockers } from './offline';

const base = { DB_DRIVER: 'memory', BLOB_DRIVER: 'memory' };
const resolve = (env: Record<string, string>) =>
  new ConfigService({ ...base, ...env }).loadFromEnvOnly();

describe('isLocalHost', () => {
  it('accepts loopback, private ranges, service names and local suffixes', () => {
    for (const h of [
      'localhost',
      'app.localhost',
      '127.0.0.1',
      '10.0.0.12',
      '172.20.1.1',
      '192.168.1.5',
      '169.254.1.1',
      '[::1]',
      'fd12:3456::1',
      'fe80::1',
      'db',
      'ollama',
      'nas.local',
      'minio.internal',
      'router.lan',
      'box.home.arpa',
    ]) {
      expect(isLocalHost(h), h).toBe(true);
    }
  });

  it('rejects public addresses and names', () => {
    for (const h of [
      'api.anthropic.com',
      '8.8.8.8',
      '172.32.0.1',
      '192.169.0.1',
      '2001:db8::1',
      'localhost.example.com',
      '',
    ]) {
      expect(isLocalHost(h), h).toBe(false);
    }
  });
});

describe('offline blockers', () => {
  it('lists every setting that reaches the internet, with its fixes', () => {
    const { config } = resolve({
      TRANSCRIPTION_PROVIDER: 'elevenlabs',
      ELEVENLABS_API_KEY: 'k',
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'k',
      AUTH_PROVIDERS: 'google,email',
      AUTH_EMAIL_SERVER: 'smtp://u:p@smtp.example.com:587',
      EMBEDDING_MODEL_URL: 'https://models.example.com/e5',
      TELEMETRY: 'sentry,otel',
      SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318',
    });
    const blockers = offlineBlockers(config);
    expect(blockers.map((b) => [b.id, b.host])).toEqual([
      ['transcription', 'api.elevenlabs.io'],
      ['llm', 'api.anthropic.com'],
      ['sign-in-google', 'accounts.google.com'],
      ['sign-in-email', 'smtp.example.com'],
      ['local-accounts', ''],
      ['telemetry-sentry', 'o1.ingest.sentry.io'],
    ]);
  });

  it('accepts local servers, an internal S3 endpoint and Postgres on the network', () => {
    const { config } = resolve({
      TRANSCRIPTION_PROVIDER: 'openai-compatible',
      TRANSCRIPTION_BASE_URL: 'http://whisper:8000/v1',
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://192.168.1.20:11434/v1',
      LLM_MODEL: 'llama3.2',
      AUTH_PROVIDERS: 'none',
      AUTH_LOCAL_ACCOUNTS: 'true',
      DB_DRIVER: 'postgres',
      DATABASE_URL: 'postgres://u:p@db:5432/askcalls',
      BLOB_DRIVER: 's3',
      S3_ENDPOINT: 'http://minio:9000',
      S3_BUCKET: 'askcalls',
    });
    expect(offlineBlockers(config)).toEqual([]);
  });

  it('flags AWS S3 and a public Postgres host', () => {
    const { config } = resolve({
      BLOB_DRIVER: 's3',
      S3_BUCKET: 'b',
      S3_REGION: 'eu-central-1',
      DB_DRIVER: 'postgres',
      DATABASE_URL: 'postgres://u:p@ep-1.eu-central-1.aws.neon.tech/db',
      AUTH_PROVIDERS: 'none',
      AUTH_LOCAL_ACCOUNTS: 'true',
      LLM_PROVIDER: 'none',
      TRANSCRIPTION_PROVIDER: 'none',
    });
    expect(offlineBlockers(config).map((b) => [b.id, b.host, b.fixes])).toEqual([
      ['blob', 's3.eu-central-1.amazonaws.com', ['local-folder']],
      ['database', 'ep-1.eu-central-1.aws.neon.tech', []],
    ]);
  });

  it('leaves out fixes that would change an env-locked setting', () => {
    const r = resolve({ TRANSCRIPTION_PROVIDER: 'elevenlabs', ELEVENLABS_API_KEY: 'k' });
    expect(
      offlineBlockers(r.config, r.locked).find((b) => b.id === 'transcription')?.fixes,
    ).toEqual([]);
    const free = resolve({});
    expect(
      offlineBlockers(free.config, free.locked).find((b) => b.id === 'transcription')?.fixes,
    ).toEqual(['local-whisper', 'off']);
  });

  it('builds a patch per fix', () => {
    const { config } = resolve({ AUTH_PROVIDERS: 'google,github' });
    expect(fixPatch(config, 'sign-in-google', 'off')).toEqual({ auth: { providers: ['github'] } });
    expect(fixPatch(config, 'transcription', 'local-whisper')).toEqual({
      transcription: { provider: 'openai-compatible', baseUrl: 'http://localhost:8000/v1' },
    });
    expect(fixPatch(config, 'llm', 'local-ollama')).toMatchObject({
      llm: { provider: 'openai-compatible', apiKey: null },
    });
    expect(fixPatch(config, 'auth-redirect-proxy', 'this-instance')).toEqual({
      auth: { redirectProxyUrl: null },
    });
    expect(fixPatch(config, 'transcription', 'local-folder')).toBeNull();
  });
});

describe('OFFLINE_MODE boot', () => {
  const offline = {
    OFFLINE_MODE: 'true',
    AUTH_LOCAL_ACCOUNTS: 'true',
    AUTH_PROVIDERS: 'none',
    TRANSCRIPTION_PROVIDER: 'none',
    LLM_PROVIDER: 'none',
  };

  it('boots when everything is local', () => {
    expect(resolve(offline).config.offlineMode).toBe(true);
  });

  it('refuses to start when anything points outside the local network', () => {
    expect(() =>
      resolve({ ...offline, LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }),
    ).toThrow(/OFFLINE_MODE: llm.provider reaches api.anthropic.com/);
    expect(() => resolve({ ...offline, AUTH_PROVIDERS: 'github' })).toThrow(ConfigError);
    expect(
      resolve({ ...offline, EMBEDDING_MODEL_URL: 'https://models.example.com/e5' }),
    ).toBeTruthy();
    expect(() =>
      resolve({ ...offline, DB_DRIVER: 'postgres', DATABASE_URL: 'postgres://u@db.example.com/x' }),
    ).toThrow(/db\.url reaches db\.example\.com/);
  });
});

describe('guarded fetch', () => {
  const ok = async () => new Response('ok');

  it('passes everything through when offline mode is off', async () => {
    const res = await guardedFetch(false, ok)('https://api.anthropic.com/v1/models');
    expect(await res.text()).toBe('ok');
  });

  it('blocks non-local hosts before a request is made in offline mode', async () => {
    let called = 0;
    const f = guardedFetch(true, async () => {
      called++;
      return new Response('ok');
    });
    await expect(f('https://api.elevenlabs.io/v1/models')).rejects.toBeInstanceOf(
      OfflineBlockedError,
    );
    await expect(f(new URL('https://8.8.8.8/'))).rejects.toBeInstanceOf(OfflineBlockedError);
    expect(called).toBe(0);
    await f('http://ollama:11434/v1/models');
    await f(new Request('http://127.0.0.1:8000/v1/models'));
    expect(called).toBe(2);
  });
});
