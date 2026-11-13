import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RateLimiter } from '../../src/ports/infra';
import type {
  ApiTokenRepository,
  AuditLog,
  InboxRepository,
  UserDataStore,
  VocabularyStore,
} from '../../src/ports/repositories';
import { type Harness, rand, testId } from './helpers';

interface Scoped<T> {
  store: T;
  userA: string;
  userB: string;
}

export function describeVocabularyStoreContract(
  name: string,
  harness: Harness<Scoped<VocabularyStore>>,
) {
  describe(`VocabularyStore contract: ${name}`, () => {
    let s: Scoped<VocabularyStore>;
    beforeEach(async () => {
      s = await harness.setup();
    });
    afterEach(async () => harness.teardown?.(s));

    it('appends with increasing seq per user and compacts', async () => {
      const d1 = await s.store.append(s.userA, rand(10));
      const d2 = await s.store.append(s.userA, rand(10));
      await s.store.append(s.userB, rand(10));
      expect(d2.seq).toBeGreaterThan(d1.seq);
      expect((await s.store.listSince(s.userA, 0)).map((d) => d.seq)).toEqual([d1.seq, d2.seq]);
      expect((await s.store.listSince(s.userA, d1.seq)).map((d) => d.seq)).toEqual([d2.seq]);
      const compacted = await s.store.compact(s.userA, d2.seq, rand(20));
      expect(compacted.compacted).toBe(true);
      const after = await s.store.listSince(s.userA, 0);
      expect(after).toHaveLength(1);
      expect(await s.store.count(s.userA)).toBe(1);
      expect(await s.store.count(s.userB)).toBe(1);
      const d3 = await s.store.append(s.userA, rand(10));
      expect(d3.seq).toBeGreaterThan(compacted.seq);
    });
  });
}

export function describeUserDataStoreContract(
  name: string,
  harness: Harness<Scoped<UserDataStore>>,
) {
  describe(`UserDataStore contract: ${name}`, () => {
    let s: Scoped<UserDataStore>;
    beforeEach(async () => {
      s = await harness.setup();
    });
    afterEach(async () => harness.teardown?.(s));

    it('enforces optimistic concurrency', async () => {
      expect(await s.store.get(s.userA, 'tags')).toBeNull();
      const v1 = await s.store.put(s.userA, 'tags', rand(10), 0);
      expect(v1).toBe(1);
      await expect(s.store.put(s.userA, 'tags', rand(10), 0)).rejects.toMatchObject({
        code: 'version_conflict',
      });
      const ct = rand(12);
      expect(await s.store.put(s.userA, 'tags', ct, 1)).toBe(2);
      expect(await s.store.get(s.userA, 'tags')).toEqual({ kind: 'tags', ct, version: 2 });
      expect(await s.store.get(s.userB, 'tags')).toBeNull();
    });
  });
}

export function describeInboxRepositoryContract(
  name: string,
  harness: Harness<Scoped<InboxRepository>>,
) {
  describe(`InboxRepository contract: ${name}`, () => {
    let s: Scoped<InboxRepository>;
    beforeEach(async () => {
      s = await harness.setup();
    });
    afterEach(async () => harness.teardown?.(s));

    it('creates, lists, deletes per user and expires', async () => {
      const now = Date.now();
      const item = await s.store.create({
        id: testId(),
        userId: s.userA,
        ephemeralPublicKey: rand(91),
        payloadCt: rand(100),
        blobKey: null,
        expiresAt: new Date(now + 1000),
      });
      await s.store.create({
        id: testId(),
        userId: s.userA,
        ephemeralPublicKey: rand(91),
        payloadCt: null,
        blobKey: 'inbox/x',
        expiresAt: new Date(now + 10_000_000),
      });
      expect(await s.store.count(s.userA)).toBe(2);
      expect(await s.store.get(s.userB, item.id)).toBeNull();
      expect(await s.store.delete(s.userB, item.id)).toBeNull();
      expect((await s.store.list(s.userA)).length).toBe(2);
      const expired = await s.store.deleteExpired(new Date(now + 5000));
      expect(expired).toEqual([{ userId: s.userA, blobKey: null }]);
      expect(await s.store.count(s.userA)).toBe(1);
    });
  });
}

export function describeApiTokenRepositoryContract(
  name: string,
  harness: Harness<Scoped<ApiTokenRepository>>,
) {
  describe(`ApiTokenRepository contract: ${name}`, () => {
    let s: Scoped<ApiTokenRepository>;
    beforeEach(async () => {
      s = await harness.setup();
    });
    afterEach(async () => harness.teardown?.(s));

    it('finds by hash, revokes per user and counts fetches per hour', async () => {
      const hash = rand(32);
      const t = await s.store.create({
        id: testId(),
        userId: s.userA,
        name: 'agent',
        tokenHash: hash,
        scopes: ['read', 'write'],
        expiresAt: null,
      });
      expect((await s.store.findByHash(hash))?.id).toBe(t.id);
      expect(await s.store.findByHash(rand(32))).toBeNull();
      expect(await s.store.countActive(s.userA, new Date())).toBe(1);
      const t0 = new Date('2026-01-01T10:00:00Z');
      expect(await s.store.incrementFetches(t.id, t0)).toBe(1);
      expect(await s.store.incrementFetches(t.id, new Date(t0.getTime() + 60_000))).toBe(2);
      expect(await s.store.incrementFetches(t.id, new Date(t0.getTime() + 3_700_000))).toBe(1);
      await s.store.revoke(s.userB, t.id, new Date());
      expect(await s.store.countActive(s.userA, new Date())).toBe(1);
      await s.store.revoke(s.userA, t.id, new Date());
      expect(await s.store.countActive(s.userA, new Date())).toBe(0);
      expect((await s.store.list(s.userA))[0]?.revokedAt).toBeInstanceOf(Date);
    });
  });
}

export function describeAuditLogContract(name: string, harness: Harness<Scoped<AuditLog>>) {
  describe(`AuditLog contract: ${name}`, () => {
    let s: Scoped<AuditLog>;
    beforeEach(async () => {
      s = await harness.setup();
    });
    afterEach(async () => harness.teardown?.(s));

    it('appends and lists newest first with paging and filters', async () => {
      for (let i = 0; i < 5; i++) {
        await s.store.append({
          userId: s.userA,
          actor: 'session',
          action: i % 2 ? 'call.read' : 'call.create',
          callId: null,
          meta: { i },
        });
        await new Promise((r) => setTimeout(r, 2));
      }
      await s.store.append({
        userId: s.userB,
        actor: 'session',
        action: 'call.read',
        callId: null,
        meta: {},
      });
      const p1 = await s.store.list(s.userA, { limit: 3 });
      expect(p1.items.map((e) => e.meta.i)).toEqual([4, 3, 2]);
      const p2 = await s.store.list(s.userA, { limit: 3, cursor: p1.nextCursor });
      expect(p2.items.map((e) => e.meta.i)).toEqual([1, 0]);
      const reads = await s.store.list(s.userA, { limit: 10 }, { action: 'call.read' });
      expect(reads.items.map((e) => e.meta.i)).toEqual([3, 1]);
    });
  });
}

export function describeRateLimiterContract(name: string, harness: Harness<RateLimiter>) {
  describe(`RateLimiter contract: ${name}`, () => {
    let limiter: RateLimiter;
    beforeEach(async () => {
      limiter = await harness.setup();
    });
    afterEach(async () => harness.teardown?.(limiter));

    it('allows up to the limit within the window, per key', async () => {
      const key = `k-${testId()}`;
      expect((await limiter.hit(key, 2, 60_000)).allowed).toBe(true);
      const second = await limiter.hit(key, 2, 60_000);
      expect(second).toMatchObject({ allowed: true, remaining: 0 });
      expect((await limiter.hit(key, 2, 60_000)).allowed).toBe(false);
      expect((await limiter.hit(`${key}-other`, 2, 60_000)).allowed).toBe(true);
    });

    it('counts fixed-window usage per key and window, refusing amounts over the limit', async () => {
      const key = `u-${testId()}`;
      const w1 = new Date('2026-03-01T00:00:00Z');
      const w2 = new Date('2026-04-01T00:00:00Z');
      expect(await limiter.usage(key, w1)).toBe(0);
      expect(await limiter.consume(key, w1, 120, 300)).toEqual({ allowed: true, used: 120 });
      expect(await limiter.consume(key, w1, 180, 300)).toEqual({ allowed: true, used: 300 });
      expect(await limiter.consume(key, w1, 1, 300)).toEqual({ allowed: false, used: 300 });
      expect(await limiter.consume(key, w1, 50, null)).toEqual({ allowed: true, used: 350 });
      expect(await limiter.usage(key, w1)).toBe(350);
      expect(await limiter.consume(key, w1, -50, null)).toEqual({ allowed: true, used: 300 });
      expect(await limiter.usage(key, w1)).toBe(300);
      expect(await limiter.usage(key, w2)).toBe(0);
      expect(await limiter.usage(`${key}-other`, w1)).toBe(0);
      expect(await limiter.consume(key, w2, 10, 300)).toEqual({ allowed: true, used: 10 });
    });
  });
}
