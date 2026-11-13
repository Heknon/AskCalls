import { describe, expect, it } from 'vitest';
import { ConfigService } from '../config/config-service';
import { appCsp, blobOrigins, DIRECT_PROVIDER_ORIGINS } from './csp';

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
});
