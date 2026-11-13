import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rows } from './driver';
import { provisionPostgres } from './int-support';
import { openTestDatabase, type TestDatabase } from './test-support';

/**
 * Spec 13: search over 10,000 seeded calls returns in under 300 ms server time on a small
 * Postgres. Seeds one user with 10,000 calls (120 keyword tokens each from a 20,000-token
 * vocabulary, tags, contacts, a year of days) and 5 chunks per call, then times each query
 * shape through the adapter. Prints p50/p95 for the report. Timed from the adapter call, so
 * the numbers include the driver round trips and the RLS transaction, not only server time.
 */
const CALLS = 10_000;
const CHUNKS_PER_CALL = 5;
const BUDGET_MS = 300;
const RUNS = 9;

async function seed(t: TestDatabase, userId: string) {
  await t.driver.asSystem(async (db) => {
    if (t.driver.kind === 'pglite') {
      // Maintaining HNSW for 50,000 inserts takes over 10 minutes in single-threaded WASM. The
      // search query never uses that index (README, "Search"), so dropping it here changes the
      // seeding time only, not the plan being measured. Server Postgres keeps it.
      await db.execute(sql`DROP INDEX "CallChunk_embedding_idx"`);
    }
    await db.execute(sql`
      INSERT INTO "Call" ("id", "userId", "status", "source", "day", "durationBucket",
        "wrappedDek", "transcriptCt", "metaCt", "contactTok", "keywordToks", "tagToks",
        "audioTok", "contentTok", "createdAt", "updatedAt")
      SELECT lpad(i::text, 8, '0'), ${userId}, 'ready', 'app', 20000 + (i % 365), (i % 5)::smallint,
        decode(repeat('ab', 60), 'hex'), decode(repeat('cd', 400), 'hex'), decode(repeat('ef', 120), 'hex'),
        (i % 300)::bigint,
        ARRAY(SELECT ((i * 7919 + k * 104729) % 20000)::bigint FROM generate_series(1, 120) k),
        CASE WHEN i % 10 = 0 THEN ARRAY[1, 2]::bigint[] WHEN i % 3 = 0 THEN ARRAY[2]::bigint[]
             ELSE '{}'::bigint[] END,
        NULL, i::bigint, now(), now()
      FROM generate_series(1, ${CALLS}::int) i`);
    for (let ord = 0; ord < CHUNKS_PER_CALL; ord++) {
      await db.execute(sql`
        INSERT INTO "CallChunk" ("callId", "userId", "ord", "embedding", "snippetCt")
        SELECT lpad(i::text, 8, '0'), ${userId}, ${ord}::int,
          ARRAY(SELECT (random() - 0.5 + 0 * i)::real FROM generate_series(1, 384))::halfvec(384),
          decode(repeat('aa', 64), 'hex')
        FROM generate_series(1, ${CALLS}::int) i`);
    }
    await db.execute(sql`ANALYZE "Call"`);
    await db.execute(sql`ANALYZE "CallChunk"`);
  });
}

/** The seeded keyword token `k` of call `i` (same formula as the seed SQL). */
const seededTok = (i: number, k: number) => BigInt((i * 7919 + k * 104729) % 20000);

function stats(ms: number[]) {
  const s = [...ms].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
  return { p50: Math.round(at(0.5) * 10) / 10, p95: Math.round(at(0.95) * 10) / 10 };
}

function randomVector() {
  const v = new Float32Array(384);
  for (let i = 0; i < v.length; i++) v[i] = Math.random() - 0.5;
  return v;
}

function describePerf(name: string, open: () => Promise<TestDatabase>) {
  describe(`search performance: ${name}`, () => {
    let t: TestDatabase;
    let userId: string;
    beforeAll(async () => {
      t = await open();
      userId = (await t.twoUsers()).userA;
      const started = performance.now();
      await seed(t, userId);
      console.log(
        `[perf:${name}] seeded ${CALLS} calls × ${CHUNKS_PER_CALL} chunks in ${Math.round(performance.now() - started)} ms`,
      );
    }, 600_000);
    afterAll(async () => {
      await t?.db.close();
    });

    const shapes: Array<[string, () => Parameters<TestDatabase['db']['search']['search']>[1]]> = [
      ['no filters, newest first', () => ({ keywordGroups: [], limit: 50 })],
      [
        'two keyword groups (fuzzy OR) + tag',
        () => ({
          keywordGroups: [
            [seededTok(30, 1), 4242n, 999n],
            [seededTok(30, 2), 5000n],
          ],
          tagToks: [2n],
          limit: 50,
        }),
      ],
      [
        'keyword + contact + day range + excluded tag',
        () => ({
          keywordGroups: [[17n, 4242n]],
          contactToks: [5n, 6n, 7n],
          excludeTagToks: [1n],
          dayFrom: 20_050,
          dayTo: 20_300,
          limit: 50,
        }),
      ],
      [
        'vector only (all 10,000 calls)',
        () => ({ keywordGroups: [], vector: randomVector(), limit: 20 }),
      ],
      [
        'vector + keyword group',
        () => ({ keywordGroups: [[17n, 4242n, 999n]], vector: randomVector(), limit: 20 }),
      ],
    ];

    for (const [label, query] of shapes) {
      it(`${label} stays under ${BUDGET_MS} ms`, async () => {
        const first = await t.db.search.search(userId, query());
        expect(first.items.length).toBeGreaterThan(0);
        const times: number[] = [];
        for (let i = 0; i < RUNS; i++) {
          const q = query();
          const started = performance.now();
          await t.db.search.search(userId, q);
          times.push(performance.now() - started);
        }
        const s = stats(times);
        console.log(`[perf:${name}] ${label}: p50 ${s.p50} ms, p95 ${s.p95} ms`);
        expect(s.p50).toBeLessThan(BUDGET_MS);
      }, 120_000);
    }

    it('pages through the vector ordering with stable cursors', async () => {
      const vector = randomVector();
      const seen = new Set<string>();
      let cursor: string | null = null;
      let lastScore = Number.POSITIVE_INFINITY;
      for (let page = 0; page < 5; page++) {
        const res = await t.db.search.search(userId, {
          keywordGroups: [],
          vector,
          limit: 50,
          cursor,
        });
        for (const hit of res.items) {
          expect(seen.has(hit.id)).toBe(false);
          seen.add(hit.id);
          expect(hit.score!).toBeLessThanOrEqual(lastScore);
          lastScore = hit.score!;
        }
        cursor = res.nextCursor;
      }
      expect(seen.size).toBe(250);
      const [plan] = await rows<{ n: number }>(
        t.driver.db,
        sql`SELECT count(*)::int AS n FROM "CallChunk"`,
      );
      expect(plan?.n).toBe(CALLS * CHUNKS_PER_CALL);
    }, 120_000);
  });
}

describePerf('pglite', () => openTestDatabase({ driver: 'pglite' }));
describePerf('pg', async () => {
  const server = await provisionPostgres();
  const t = await openTestDatabase({ driver: 'pg', url: server.url, poolMax: 4 });
  const close = t.db.close;
  t.db.close = async () => {
    await close();
    await server.stop();
  };
  return t;
});
