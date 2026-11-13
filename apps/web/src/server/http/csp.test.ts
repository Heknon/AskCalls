import { describe, expect, it } from 'vitest';
import { ConfigService } from '../config/config-service';
import {
  appCsp,
  blobOrigins,
  DIRECT_PROVIDER_ORIGINS,
  embeddingModelUrl,
  GOOGLE_ONE_TAP_ORIGIN,
  publicCsp,
} from './csp';

const config = (env: Record<string, string>) =>
  new ConfigService({ DB_DRIVER: 'memory', ...env }).loadFromEnvOnly().config;

const directive = (csp: string, name: string) =>
  csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';

describe('app CSP', () => {
  it('allows only self and this request nonce for scripts', () => {
    const csp = appCsp(config({ BLOB_DRIVER: 'memory' }), 'abc', 'production');
    expect(directive(csp, 'script-src')).toBe(
      "script-src 'self' 'nonce-abc' 'wasm-unsafe-eval' 'strict-dynamic'",
    );
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain("'unsafe-eval'");
    expect(appCsp(config({ BLOB_DRIVER: 'memory' }), 'abc', 'development')).toContain(
      "'unsafe-eval'",
    );
  });

  it('adds the configured blob origin to connect-src', () => {
    const c = config({
      BLOB_DRIVER: 's3',
      S3_BUCKET: 'askcalls-dev',
      S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
    });
    expect(blobOrigins(c)).toEqual([
      'https://acct.r2.cloudflarestorage.com',
      'https://askcalls-dev.acct.r2.cloudflarestorage.com',
    ]);
    const connect = directive(appCsp(c, 'n', 'production'), 'connect-src');
    expect(connect).toContain('https://askcalls-dev.acct.r2.cloudflarestorage.com');
    expect(
      blobOrigins(config({ BLOB_DRIVER: 's3', S3_BUCKET: 'b', S3_REGION: 'eu-central-1' })),
    ).toEqual(['https://b.s3.eu-central-1.amazonaws.com', 'https://s3.eu-central-1.amazonaws.com']);
  });

  it('drops provider origins in offline mode', () => {
    const online = appCsp(config({ BLOB_DRIVER: 'memory' }), 'n', 'production');
    expect(online).toContain(DIRECT_PROVIDER_ORIGINS[0]);
    const offline = appCsp(
      config({ BLOB_DRIVER: 'memory', OFFLINE_MODE: 'true', AUTH_LOCAL_ACCOUNTS: 'true' }),
      'n',
      'production',
    );
    expect(directive(offline, 'connect-src')).toBe("connect-src 'self'");
  });

  it('adds the embedding model host to connect-src only when one is configured', () => {
    const none = config({ BLOB_DRIVER: 'memory' });
    expect(embeddingModelUrl(none)).toBeNull();
    expect(directive(appCsp(none, 'n', 'production'), 'connect-src')).not.toContain('models.');

    const hosted = config({
      BLOB_DRIVER: 'memory',
      EMBEDDING_MODEL_URL: 'https://models.example.com/askcalls',
    });
    expect(embeddingModelUrl(hosted)).toBe('https://models.example.com/askcalls');
    const connect = directive(appCsp(hosted, 'n', 'production'), 'connect-src').split(' ');
    expect(connect).toContain('https://models.example.com');
    expect(connect.filter((s) => s.includes('models.example.com'))).toHaveLength(1);
  });

  it('serves the model from this origin in offline mode', () => {
    const c = config({
      BLOB_DRIVER: 'memory',
      OFFLINE_MODE: 'true',
      AUTH_LOCAL_ACCOUNTS: 'true',
      EMBEDDING_MODEL_URL: 'https://models.example.com',
    });
    expect(embeddingModelUrl(c)).toBeNull();
    expect(directive(appCsp(c, 'n', 'production'), 'connect-src')).toBe("connect-src 'self'");
  });

  it('rejects a plain-http model host', () => {
    expect(() => config({ EMBEDDING_MODEL_URL: 'http://models.example.com' })).toThrow();
  });
});

describe('public CSP (/ and /login)', () => {
  it('allows accounts.google.com only when One Tap is on, and never unsafe-inline', () => {
    const on = publicCsp('n', 'production', true);
    expect(directive(on, 'script-src')).toBe("script-src 'self' 'nonce-n' 'strict-dynamic'");
    expect(directive(on, 'frame-src')).toBe(`frame-src ${GOOGLE_ONE_TAP_ORIGIN}`);
    expect(directive(on, 'connect-src')).toContain(GOOGLE_ONE_TAP_ORIGIN);
    expect(on).not.toContain('unsafe-inline');
    const off = publicCsp('n', 'production', false);
    expect(off).not.toContain('google');
    expect(directive(off, 'frame-src')).toBe("frame-src 'none'");
  });

  it('keeps accounts.google.com out of the app CSP', () => {
    expect(appCsp(config({ BLOB_DRIVER: 'memory' }), 'n', 'production')).not.toContain(
      GOOGLE_ONE_TAP_ORIGIN,
    );
  });
});
