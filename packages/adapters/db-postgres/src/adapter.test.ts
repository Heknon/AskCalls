import type { NewCall } from '@askcalls/domain';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rows } from './driver';
import { openTestDatabase, type TestDatabase } from './test-support';

/** Adapter behavior beyond the shared contracts. */
let n = 0;
function call(userId: string, overrides: Partial<NewCall> = {}): NewCall {
  n += 1;
  return {
    id: `call-${n}`,
    userId,
    status: 'ready',
    source: 'app',
    day: 20_000 + n,
    durationBucket: 0,
    wrappedDek: new Uint8Array([1]),
    transcriptCt: new Uint8Array([2]),
    metaCt: new Uint8Array([3]),
    contactTok: null,
    keywordToks: [],
    tagToks: [],
    audioTok: null,
    contentTok: BigInt(n),
    recording: null,
    ...overrides,
  };
}

describe('postgres adapter specifics (pglite)', () => {
  let t: TestDatabase;
  let userA: string;
  let userB: string;
  beforeAll(async () => {
    t = await openTestDatabase({ driver: 'pglite' });
  });
  afterAll(async () => {
    await t.db.close();
  });
  beforeEach(async () => {
    await t.reset();
    ({ userA, userB } = await t.twoUsers());
  });

  it("refuses a call id that exists for another user, without touching that user's row", async () => {
    const c = call(userA);
    await t.db.calls.create(c);
    await expect(
      t.db.calls.create({ ...call(userB), id: c.id, metaCt: new Uint8Array([9]) }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect((await t.db.calls.get(userA, c.id))?.metaCt).toEqual(new Uint8Array([3]));
  });

  it('reports the existing id on a duplicate', async () => {
    const c = call(userA, { audioTok: 77n });
    await t.db.calls.create(c);
    await expect(t.db.calls.create(call(userA, { audioTok: 77n }))).rejects.toMatchObject({
      code: 'duplicate',
      details: { existingId: c.id },
    });
  });

  it('counts recording bytes in the instance bucket only', async () => {
    await t.db.calls.create(
      call(userA, { recording: { bucketRef: null, objectKey: 'a', bytes: 5_000_000_000 } }),
    );
    await t.db.calls.create(
      call(userA, { recording: { bucketRef: 'mine', objectKey: 'b', bytes: 700 } }),
    );
    expect(await t.db.calls.totalRecordingBytes(userA)).toBe(5_000_000_000);
    const [own] = (await t.db.calls.list(userA, {}, { limit: 1 })).items;
    expect(own?.hasRecording).toBe(true);
  });

  it('round-trips extreme tokens and filters on them', async () => {
    const min = -(2n ** 63n);
    const max = 2n ** 63n - 1n;
    const c = call(userA, { keywordToks: [min, max], tagToks: [max], contactTok: min });
    await t.db.calls.create(c);
    expect((await t.db.calls.get(userA, c.id))?.keywordToks).toEqual([min, max]);
    const hits = await t.db.search.search(userA, {
      keywordGroups: [[min]],
      tagToks: [max],
      contactToks: [min],
      limit: 10,
    });
    expect(hits.items.map((h) => h.id)).toEqual([c.id]);
  });

  it('rejects malformed cursors and vectors as invalid', async () => {
    await expect(t.db.calls.list(userA, {}, { limit: 5, cursor: 'nope' })).rejects.toMatchObject({
      code: 'invalid',
    });
    const c = call(userA);
    await t.db.calls.create(c);
    await expect(
      t.db.search.upsertChunks(userA, c.id, [
        { ord: 0, lang: null, embedding: new Float32Array(3), snippetCt: new Uint8Array(1) },
      ]),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      t.db.search.upsertChunks(userB, c.id, [
        { ord: 0, lang: null, embedding: new Float32Array(384), snippetCt: new Uint8Array(1) },
      ]),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('keys RateBucket by (key, windowStart) and weighs the previous window', async () => {
    const [pk] = await rows<{ cols: string }>(
      t.driver.db,
      sql`SELECT string_agg(a.attname, ',' ORDER BY array_position(i.indkey, a.attnum)) AS cols
          FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = '"RateBucket"'::regclass AND i.indisprimary`,
    );
    expect(pk?.cols).toBe('key,windowStart');
    const { createRateLimiter } = await import('./repos/rate-limiter');
    let now = new Date('2026-01-01T00:00:59Z');
    const limiter = createRateLimiter(t.driver, () => now);
    expect((await limiter.hit('k', 2, 60_000)).allowed).toBe(true);
    expect((await limiter.hit('k', 2, 60_000)).allowed).toBe(true);
    // 1 s into the next window the previous one still weighs 59/60 × 2 ≈ 1.97.
    now = new Date('2026-01-01T00:01:01Z');
    expect((await limiter.hit('k', 2, 60_000)).allowed).toBe(false);
    // 30 s in it weighs 0.5 × 2 = 1: one more hit fits.
    now = new Date('2026-01-01T00:01:30Z');
    const r = await limiter.hit('k', 2, 60_000);
    expect(r).toMatchObject({ allowed: true, resetAt: new Date('2026-01-01T00:02:00Z') });
  });
});
