import { S3BlobStore } from '@askcalls/adapter-blob-s3';
import { describe, expect, it } from 'vitest';
import { ConfigError, ConfigService } from '../config/config-service';
import { buildBlobStore } from './blob';

const s3Env = {
  DB_DRIVER: 'memory',
  BLOB_DRIVER: 's3',
  S3_BUCKET: 'askcalls-dev',
  S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
  S3_ACCESS_KEY_ID: 'AKIDEXAMPLE',
  S3_SECRET_ACCESS_KEY: 'secret',
};

describe('buildBlobStore', () => {
  it('passes S3_KEY_PREFIX to the S3 adapter', async () => {
    const { config } = new ConfigService({
      ...s3Env,
      S3_KEY_PREFIX: 'preview/pr-12/',
    }).loadFromEnvOnly();
    const store = await buildBlobStore(config);
    expect(store).toBeInstanceOf(S3BlobStore);
    const get = await store.presignGet('u1/rec', { expiresInSec: 60 });
    expect(new URL(get.url).pathname).toBe('/askcalls-dev/preview/pr-12/u1/rec');
  });

  it('rejects a prefix that is not slash-terminated path segments', () => {
    for (const bad of ['preview/pr-12', '/preview/', 'a//b/']) {
      expect(() => new ConfigService({ ...s3Env, S3_KEY_PREFIX: bad }).loadFromEnvOnly()).toThrow(
        ConfigError,
      );
    }
  });
});
