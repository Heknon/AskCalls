import { describeBlobStoreContract } from '@askcalls/domain/contracts/blob-store';
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { applyBucketCors, checkBucketCors, checkCorsByPreflight } from '../src/cors';
import { buildS3Client, S3BlobStore } from '../src/s3-blob-store';

/**
 * Runs against a real S3-compatible server (MinIO from docker/docker-compose.yml, or any other).
 *   S3_TEST_ENDPOINT=http://127.0.0.1:9000 S3_TEST_ACCESS_KEY_ID=... S3_TEST_SECRET_ACCESS_KEY=...
 *   bun run test:integration
 * Each test run creates and removes its own bucket.
 */
const endpoint = process.env.S3_TEST_ENDPOINT;
const accessKeyId = process.env.S3_TEST_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_TEST_SECRET_ACCESS_KEY;
const region = process.env.S3_TEST_REGION ?? 'us-east-1';
const enabled = Boolean(endpoint && accessKeyId && secretAccessKey);

async function freshBucket(): Promise<S3BlobStore> {
  const bucket = `askcalls-test-${crypto.randomUUID().slice(0, 8)}`;
  const client = buildS3Client({ endpoint, region, accessKeyId, secretAccessKey });
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  return new S3BlobStore({ bucket, client });
}

describe.skipIf(!enabled)('S3BlobStore against a real server', () => {
  describeBlobStoreContract('s3', {
    setup: freshBucket,
    teardown: async (s) => {
      const store = s as S3BlobStore;
      const left = await store.client.send(new ListObjectsV2Command({ Bucket: store.bucket }));
      for (const o of left.Contents ?? []) await store.delete(o.Key!);
      await store.client.send(new DeleteBucketCommand({ Bucket: store.bucket }));
    },
  });

  it('enforces the signed content length on presigned PUT', async () => {
    const store = await freshBucket();
    const put = await store.presignPut('u1/rec', { expiresInSec: 60, contentLength: 5 });
    const wrong = await fetch(put.url, { method: 'PUT', body: new Uint8Array(6) });
    expect(wrong.ok).toBe(false);
    const right = await fetch(put.url, {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3, 4, 5]),
      headers: put.headers,
    });
    expect(right.status).toBe(200);
    expect(await store.size('u1/rec')).toBe(5);
    const get = await store.presignGet('u1/rec', { expiresInSec: 60 });
    const res = await fetch(get.url);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    await store.delete('u1/rec');
    await store.client.send(new DeleteBucketCommand({ Bucket: store.bucket }));
  });

  it('paginates deletePrefix over more than one page', async () => {
    const store = await freshBucket();
    const n = 1005;
    const body = new Uint8Array(1);
    for (let i = 0; i < n; i += 50) {
      await Promise.all(
        Array.from({ length: Math.min(50, n - i) }, (_, j) =>
          store.client.send(
            new PutObjectCommand({ Bucket: store.bucket, Key: `bulk/${i + j}`, Body: body }),
          ),
        ),
      );
    }
    await store.put('keep/1', body);
    expect(await store.deletePrefix('bulk/')).toBe(n);
    expect(await store.exists('keep/1')).toBe(true);
    await store.delete('keep/1');
    await store.client.send(new DeleteBucketCommand({ Bucket: store.bucket }));
  });

  it('reports a missing bucket', async () => {
    const client = buildS3Client({ endpoint, region, accessKeyId, secretAccessKey });
    const store = new S3BlobStore({ bucket: `askcalls-missing-${Date.now()}`, client });
    expect(await store.healthCheck()).toMatchObject({ ok: false, message: 'bucket not found' });
  });

  it('checks CORS by configuration and by preflight', async () => {
    const store = await freshBucket();
    const origin = 'https://askcalls.example';
    const before = await checkBucketCors(store, origin);
    expect(before).toMatchObject({ status: 'missing', problems: ['no_cors_configuration'] });
    const applied = await applyBucketCors(store, [origin]).then(
      () => null,
      (e) => e,
    );
    if (applied) {
      // MinIO community edition sets CORS server-wide (MINIO_API_CORS_ALLOW_ORIGIN, default *)
      // and answers PutBucketCors with 501, so only the preflight check can tell.
      expect(applied).toMatchObject({ code: 'provider_error', details: { status: 501 } });
    } else {
      expect(await checkBucketCors(store, origin)).toEqual({ status: 'ok' });
    }
    expect(await checkCorsByPreflight(store, origin)).toEqual({ status: 'ok' });
    await store.client.send(new DeleteBucketCommand({ Bucket: store.bucket }));
  });
});
