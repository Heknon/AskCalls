import { describe, expect, it } from 'vitest';
import { type BucketConfig, bucketTarget, SigV4BucketStore } from './own-bucket';
import { readBody } from './transfer';

const bucket = (over: Partial<BucketConfig> = {}): BucketConfig => ({
  id: 'b1',
  endpoint: 'https://acct.r2.cloudflarestorage.com',
  bucket: 'calls',
  region: 'auto',
  accessKeyId: 'AKID',
  secretAccessKey: 'SECRET',
  ...over,
});

describe('own bucket', () => {
  it('uses path style for S3-compatible services and virtual hosts on AWS', () => {
    expect(bucketTarget(bucket(), 'askcalls/c 1/x').url.href).toBe(
      'https://acct.r2.cloudflarestorage.com/calls/askcalls/c%201/x',
    );
    expect(bucketTarget(bucket({ endpoint: 'http://localhost:9000' }), 'k').url.href).toBe(
      'http://localhost:9000/calls/k',
    );
    const aws = bucketTarget(
      bucket({ endpoint: 's3.eu-central-1.amazonaws.com', region: 'eu-central-1' }),
      'k',
    );
    expect(aws.url.href).toBe('https://calls.s3.eu-central-1.amazonaws.com/k');
    expect(aws.path).toBe('/k');
    const dotted = bucketTarget(
      bucket({ endpoint: 'https://s3.amazonaws.com', bucket: 'my.calls' }),
      'k',
    );
    expect(dotted.url.href).toBe('https://s3.amazonaws.com/my.calls/k');
  });

  it('signs PUT with the body hash and never sends credentials or cookies', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const store = new SigV4BucketStore(async () => bucket(), {
      now: () => new Date('2026-01-02T03:04:05Z'),
      fetch: async (url, init) => {
        seen.push({ url, init: init! });
        return new Response(null, { status: 200 });
      },
    });
    await store.put('b1', 'askcalls/c/x', Uint8Array.of(1, 2, 3));
    const { url, init } = seen[0]!;
    expect(url).toBe('https://acct.r2.cloudflarestorage.com/calls/askcalls/c/x');
    const h = init.headers as Record<string, string>;
    expect(h['x-amz-content-sha256']).toBe(
      '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    );
    expect(h.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKID\/20260102\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
    expect(JSON.stringify(h)).not.toContain('SECRET');
    expect(init.credentials).toBe('omit');
  });

  it('maps probe failures', async () => {
    const store = (status: number | 'throw') =>
      new SigV4BucketStore(async () => bucket(), {
        fetch: async () => {
          if (status === 'throw') throw new TypeError('Failed to fetch');
          return new Response(null, { status });
        },
      });
    expect(await store(200).probe(bucket())).toEqual({ ok: true });
    expect(await store(403).probe(bucket())).toMatchObject({ ok: false, reason: 'unauthorized' });
    expect(await store('throw').probe(bucket())).toEqual({
      ok: false,
      reason: 'cors_or_network',
    });
  });

  it('reads streamed bodies with and without a length', async () => {
    const parts = [Uint8Array.of(1, 2), Uint8Array.of(3), Uint8Array.of(4, 5, 6)];
    const stream = () =>
      new ReadableStream<Uint8Array>({
        start(c) {
          for (const p of parts) c.enqueue(p);
          c.close();
        },
      });
    const progress: number[] = [];
    const a = await readBody(new Response(stream()), (n) => progress.push(n));
    expect([...a]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(progress).toEqual([2, 3, 6]);
    const b = await readBody(new Response(stream(), { headers: { 'content-length': '6' } }));
    expect([...b]).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
