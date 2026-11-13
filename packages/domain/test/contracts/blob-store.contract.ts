import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BlobStore } from '../../src/ports/blob-store';
import { type Harness, rand } from './helpers';

export function describeBlobStoreContract(name: string, harness: Harness<BlobStore>) {
  describe(`BlobStore contract: ${name}`, () => {
    let store: BlobStore;
    beforeEach(async () => {
      store = await harness.setup();
    });
    afterEach(async () => {
      await harness.teardown?.(store);
    });

    it('round-trips bytes', async () => {
      const body = rand(4096);
      await store.put('u1/calls/a/rec', body);
      expect(await store.get('u1/calls/a/rec')).toEqual(body);
      expect(await store.exists('u1/calls/a/rec')).toBe(true);
      expect(await store.size('u1/calls/a/rec')).toBe(4096);
    });

    it('returns null for missing keys', async () => {
      expect(await store.get('missing')).toBeNull();
      expect(await store.exists('missing')).toBe(false);
      expect(await store.size('missing')).toBeNull();
    });

    it('deletes idempotently', async () => {
      await store.put('k', rand(8));
      await store.delete('k');
      await store.delete('k');
      expect(await store.get('k')).toBeNull();
    });

    it('deletes by prefix', async () => {
      await store.put('p/1', rand(4));
      await store.put('p/2', rand(4));
      await store.put('q/1', rand(4));
      expect(await store.deletePrefix('p/')).toBe(2);
      expect(await store.exists('q/1')).toBe(true);
    });

    it('presigns PUT and GET', async () => {
      const put = await store.presignPut('pre/1', { expiresInSec: 60, contentLength: 3 });
      expect(put.method).toBe('PUT');
      expect(put.url).toMatch(/^(https?|file|mock):/);
      expect(put.expiresAt.getTime()).toBeGreaterThan(Date.now());
      const get = await store.presignGet('pre/1', { expiresInSec: 60 });
      expect(get.method).toBe('GET');
    });

    it('reports health', async () => {
      expect((await store.healthCheck()).ok).toBe(true);
    });
  });
}
