import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsBlobStore } from '@askcalls/adapter-blob-fs';
import { MemoryBlobStore, MemoryRateLimiter } from '@askcalls/adapter-mocks';
import type { Ports } from '@askcalls/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleBlob } from './blob-route';

const BASE = 'http://localhost:3000';
const KEY = 'u1/calls/c1/recording';

let dir: string;
let store: FsBlobStore;
let ports: Ports;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'askcalls-blob-route-'));
  store = new FsBlobStore({ dir, baseUrl: BASE });
  ports = { blobs: store, rateLimiter: new MemoryRateLimiter() } as unknown as Ports;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const parts = (url: string) => new URL(url).pathname.replace('/api/blob/', '').split('/');

async function put(url: string, body: Uint8Array, length = body.length) {
  const req = new Request(url, {
    method: 'PUT',
    body: body as Uint8Array<ArrayBuffer>,
    headers: { 'content-length': String(length) },
  });
  return handleBlob(ports, req, parts(url));
}

describe('/api/blob', () => {
  it('stores and serves ciphertext through presigned URLs, with no-store', async () => {
    const body = crypto.getRandomValues(new Uint8Array(5000));
    const up = await store.presignPut(KEY, { expiresInSec: 60, contentLength: body.length });
    const res = await put(up.url, body);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');

    const down = await store.presignGet(KEY, { expiresInSec: 60 });
    const got = await handleBlob(ports, new Request(down.url), parts(down.url));
    expect(got.status).toBe(200);
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(body);
    expect(got.headers.get('cache-control')).toBe('no-store');
  });

  it('refuses tampered, expired, wrong-method and wrong-length requests', async () => {
    const body = new Uint8Array(10);
    const up = await store.presignPut(KEY, { expiresInSec: 60, contentLength: 10 });
    expect((await put(up.url.replace('sig=', 'sig=A'), body)).status).toBe(403);
    expect((await put(up.url, new Uint8Array(11))).status).toBe(403);
    expect((await put(up.url.replace(KEY, 'u2/calls/c1/recording'), body)).status).toBe(403);
    const asGet = await handleBlob(ports, new Request(up.url), parts(up.url));
    expect(asGet.status).toBe(403);
    const short = await store.presignGet(KEY, { expiresInSec: 1 });
    const expired = short.url.replace(/exp=\d+/, 'exp=1');
    expect((await handleBlob(ports, new Request(expired), parts(expired))).status).toBe(403);
  });

  it('rejects a body that does not match its declared length', async () => {
    const up = await store.presignPut(KEY, { expiresInSec: 60 });
    expect((await put(up.url, new Uint8Array(10), 4)).status).toBe(400);
  });

  it('rejects traversal keys', async () => {
    const up = await store.presignGet(KEY, { expiresInSec: 60 });
    const evil = up.url.replace(KEY, '../etc/passwd');
    expect((await handleBlob(ports, new Request(evil), ['..', 'etc', 'passwd'])).status).toBe(403);
  });

  it('is not found for stores that presign their own URLs', async () => {
    const s3Like = { blobs: new MemoryBlobStore(), rateLimiter: new MemoryRateLimiter() };
    const res = await handleBlob(s3Like as unknown as Ports, new Request(`${BASE}/api/blob/k`), [
      'k',
    ]);
    expect(res.status).toBe(404);
  });

  it('rate-limits per address', async () => {
    const down = await store.presignGet(KEY, { expiresInSec: 60 });
    const statuses = new Set<number>();
    for (let i = 0; i < 601; i++) {
      const r = await handleBlob(ports, new Request(down.url), parts(down.url));
      statuses.add(r.status);
    }
    expect(statuses.has(429)).toBe(true);
  });
});
