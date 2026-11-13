import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeBlobStoreContract } from '@askcalls/domain/contracts/blob-store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsBlobStore } from '../src/fs-blob-store';
import { isValidKey } from '../src/keys';
import { verifyBlobUrl } from '../src/signing';

const BASE = 'http://localhost:3000';

async function tempStore(secret?: Uint8Array) {
  const dir = await mkdtemp(join(tmpdir(), 'askcalls-blob-fs-'));
  return new FsBlobStore({ dir, baseUrl: BASE, ...(secret ? { signingSecret: secret } : {}) });
}

describeBlobStoreContract('fs', {
  setup: () => tempStore(),
  teardown: async (s) => rm((s as FsBlobStore).root, { recursive: true, force: true }),
});

describe('FsBlobStore', () => {
  let store: FsBlobStore;
  beforeEach(async () => {
    store = await tempStore();
  });
  afterEach(async () => {
    await rm(store.root, { recursive: true, force: true });
  });

  describe('key safety', () => {
    const bad = [
      '',
      '..',
      '.',
      '../etc/passwd',
      'a/../../b',
      'a/./b',
      '/abs',
      'a//b',
      'a/',
      'a\\b',
      '..\\..\\x',
      '.hidden',
      'a/.tmp-x',
      'a%2F..',
      'nul\0byte',
      'C:evil',
      'sp ace',
      'x'.repeat(1025),
      'ü',
    ];
    it.each(bad)('rejects %j on every operation', async (key) => {
      expect(isValidKey(key)).toBe(false);
      for (const op of [
        () => store.put(key, new Uint8Array(1)),
        () => store.get(key),
        () => store.delete(key),
        () => store.exists(key),
        () => store.size(key),
        () => store.presignGet(key, { expiresInSec: 60 }),
        () => store.presignPut(key, { expiresInSec: 60 }),
      ]) {
        await expect(op()).rejects.toMatchObject({ name: 'DomainError', code: 'invalid' });
      }
    });

    it('rejects traversal in prefixes', async () => {
      await expect(store.deletePrefix('../')).rejects.toMatchObject({ code: 'invalid' });
      await expect(store.deletePrefix('a/../')).rejects.toMatchObject({ code: 'invalid' });
    });

    it('never writes outside the root', async () => {
      const outside = join(store.root, '..', 'escaped.blob');
      await expect(store.put('../escaped', new Uint8Array(1))).rejects.toThrow();
      await expect(stat(outside)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('accepts uuid-like and dotted keys', async () => {
      const key = 'u_01/calls/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b/rec.v1';
      await store.put(key, new Uint8Array([1, 2]));
      expect(await store.get(key)).toEqual(new Uint8Array([1, 2]));
    });
  });

  it('keeps a key apart from keys below it', async () => {
    await store.put('p', new Uint8Array([1]));
    await store.put('p/1', new Uint8Array([2]));
    expect(await store.get('p')).toEqual(new Uint8Array([1]));
    expect(await store.get('p/1')).toEqual(new Uint8Array([2]));
    expect(await store.get('p/1/deeper')).toBeNull();
  });

  it('overwrites atomically and leaves no temp files', async () => {
    await store.put('a/b', new Uint8Array(1000).fill(1));
    await store.put('a/b', new Uint8Array(10).fill(2));
    expect(await store.size('a/b')).toBe(10);
    const names = await readdir(join(store.root, 'a'));
    expect(names).toEqual(['b.blob']);
  });

  it('creates owner-only files and directories', async () => {
    await store.put('u1/x', new Uint8Array(4));
    expect((await stat(join(store.root, 'u1'))).mode & 0o777).toBe(0o700);
    expect((await stat(join(store.root, 'u1', 'x.blob'))).mode & 0o777).toBe(0o600);
  });

  it('deletes by partial prefix and prunes empty directories', async () => {
    await store.put('u1/calls/a/rec', new Uint8Array(1));
    await store.put('u1/calls/a/inbox', new Uint8Array(1));
    await store.put('u1/calls/ab/rec', new Uint8Array(1));
    await store.put('u1/cx', new Uint8Array(1));
    await store.put('u2/calls/a/rec', new Uint8Array(1));
    expect(await store.deletePrefix('u1/calls/a')).toBe(3);
    expect(await store.exists('u1/cx')).toBe(true);
    expect(await store.exists('u2/calls/a/rec')).toBe(true);
    expect(await readdir(join(store.root, 'u1'))).toEqual(['cx.blob']);
    expect(await store.deletePrefix('nothing/')).toBe(0);
    expect(await store.deletePrefix('u')).toBe(2);
  });

  it('reports an unwritable root', async () => {
    const file = join(store.root, 'not-a-dir');
    await writeFile(file, 'x');
    const broken = new FsBlobStore({ dir: join(file, 'sub'), baseUrl: BASE });
    const h = await broken.healthCheck();
    expect(h.ok).toBe(false);
    expect(h.message).toBe('not writable');
  });

  describe('presigned URLs', () => {
    it('has the documented shape', async () => {
      const put = await store.presignPut('u1/calls/c1/rec', {
        expiresInSec: 300,
        contentLength: 42,
        contentType: 'application/octet-stream',
      });
      const url = new URL(put.url);
      expect(url.origin).toBe(BASE);
      expect(url.pathname).toBe('/api/blob/u1/calls/c1/rec');
      expect([...url.searchParams.keys()]).toEqual(['exp', 'len', 'sig']);
      expect(put.headers).toEqual({ 'content-type': 'application/octet-stream' });
      expect(Number(url.searchParams.get('exp')) * 1000).toBe(put.expiresAt.getTime());
      const get = await store.presignGet('u1/calls/c1/rec', { expiresInSec: 60 });
      expect([...new URL(get.url).searchParams.keys()]).toEqual(['exp', 'sig']);
    });

    async function check(
      url: string,
      method: string,
      contentLength?: number,
      now?: Date,
      blobKey?: string,
    ) {
      const u = new URL(url);
      return store.verifyPresigned({
        method,
        blobKey: blobKey ?? decodeURIComponent(u.pathname.slice('/api/blob/'.length)),
        query: u.searchParams,
        contentLength: contentLength ?? null,
        ...(now ? { now } : {}),
      });
    }

    it('verifies a valid PUT and GET', async () => {
      const put = await store.presignPut('k/1', { expiresInSec: 60, contentLength: 3 });
      expect(await check(put.url, 'PUT', 3)).toMatchObject({ ok: true });
      const get = await store.presignGet('k/1', { expiresInSec: 60 });
      expect(await check(get.url, 'GET')).toMatchObject({ ok: true });
    });

    it('binds the method', async () => {
      const get = await store.presignGet('k/1', { expiresInSec: 60 });
      expect(await check(get.url, 'PUT', 3)).toEqual({ ok: false, reason: 'bad_signature' });
      expect(await check(get.url, 'DELETE')).toEqual({ ok: false, reason: 'malformed' });
    });

    it('binds the key', async () => {
      const put = await store.presignPut('k/1', { expiresInSec: 60 });
      expect(await check(put.url, 'PUT', 1, undefined, 'k/2')).toEqual({
        ok: false,
        reason: 'bad_signature',
      });
      expect(await check(put.url, 'PUT', 1, undefined, '../k/1')).toEqual({
        ok: false,
        reason: 'malformed',
      });
    });

    it('binds the content length', async () => {
      const put = await store.presignPut('k/1', { expiresInSec: 60, contentLength: 3 });
      expect(await check(put.url, 'PUT', 4)).toEqual({ ok: false, reason: 'length_mismatch' });
      expect(await check(put.url, 'PUT')).toEqual({ ok: false, reason: 'length_mismatch' });
      const u = new URL(put.url);
      u.searchParams.set('len', '999');
      expect(await check(u.toString(), 'PUT', 999)).toEqual({
        ok: false,
        reason: 'bad_signature',
      });
      u.searchParams.delete('len');
      expect(await check(u.toString(), 'PUT', 999)).toEqual({
        ok: false,
        reason: 'bad_signature',
      });
    });

    it('expires', async () => {
      const get = await store.presignGet('k/1', { expiresInSec: 60 });
      const later = new Date(Date.now() + 61_000);
      expect(await check(get.url, 'GET', undefined, later)).toEqual({
        ok: false,
        reason: 'expired',
      });
      const u = new URL(get.url);
      u.searchParams.set('exp', String(Number(u.searchParams.get('exp')) + 3600));
      expect(await check(u.toString(), 'GET', undefined, later)).toEqual({
        ok: false,
        reason: 'bad_signature',
      });
    });

    it('rejects tampered and malformed signatures', async () => {
      const get = await store.presignGet('k/1', { expiresInSec: 60 });
      const u = new URL(get.url);
      const sig = u.searchParams.get('sig')!;
      u.searchParams.set('sig', (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1));
      expect(await check(u.toString(), 'GET')).toEqual({ ok: false, reason: 'bad_signature' });
      u.searchParams.set('sig', 'not base64!');
      expect(await check(u.toString(), 'GET')).toEqual({ ok: false, reason: 'malformed' });
      u.searchParams.delete('sig');
      expect(await check(u.toString(), 'GET')).toEqual({ ok: false, reason: 'malformed' });
    });

    it('rejects URLs signed by another store', async () => {
      const other = await tempStore();
      const get = await other.presignGet('k/1', { expiresInSec: 60 });
      expect(await check(get.url, 'GET')).toEqual({ ok: false, reason: 'bad_signature' });
      await rm(other.root, { recursive: true, force: true });
    });

    it('persists the generated signing key with owner-only permissions', async () => {
      const get = await store.presignGet('k/1', { expiresInSec: 60 });
      const keyFile = join(store.root, '.signing-key');
      expect((await stat(keyFile)).mode & 0o777).toBe(0o600);
      expect((await readFile(keyFile)).length).toBe(32);
      const reopened = new FsBlobStore({ dir: store.root, baseUrl: BASE });
      const u = new URL(get.url);
      expect(
        await reopened.verifyPresigned({ method: 'GET', blobKey: 'k/1', query: u.searchParams }),
      ).toMatchObject({ ok: true });
    });

    it('uses a provided secret and the standalone verifier', async () => {
      const secret = new Uint8Array(32).fill(7);
      const a = await tempStore(secret);
      const get = await a.presignGet('k/1', { expiresInSec: 60 });
      const key = await crypto.subtle.importKey(
        'raw',
        secret,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      expect(
        await verifyBlobUrl(key, {
          method: 'GET',
          blobKey: 'k/1',
          query: new URL(get.url).searchParams,
        }),
      ).toMatchObject({ ok: true });
      await rm(a.root, { recursive: true, force: true });
    });

    it('validates expiry and length', async () => {
      await expect(store.presignGet('k', { expiresInSec: 0 })).rejects.toMatchObject({
        code: 'invalid',
      });
      await expect(store.presignGet('k', { expiresInSec: 8 * 24 * 3600 })).rejects.toMatchObject({
        code: 'invalid',
      });
      await expect(
        store.presignPut('k', { expiresInSec: 60, contentLength: -1 }),
      ).rejects.toMatchObject({ code: 'invalid' });
    });
  });
});
