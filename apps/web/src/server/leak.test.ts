import { normalizeText } from '@askcalls/indexing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ClientHarness, startClientHarness } from './testing/client';
import { dump, findLeaks, needles, seedLeakData } from './testing/leak';
import { ENGLISH_CALL } from './testing/samples';

/**
 * The leak test (spec 2 rule 7) on the in-memory adapters. Calls go through the full client
 * pipeline into the real route handlers (testing/leak.ts); then every value reachable from the
 * server's ports (all tables of the memory database, every blob, audit, telemetry, rate-limit and
 * provider state) is dumped and searched. The dump walks objects generically, so new tables and
 * fields are covered without changing this test. leak.pglite.test.ts runs the same seed on the
 * Postgres adapter (PGlite) and fs blob storage.
 */

let h: ClientHarness;

beforeAll(async () => {
  h = await startClientHarness();
  await seedLeakData(h);
});

afterAll(() => h.app.close());

describe('leak test (spec 2 rule 7)', () => {
  it('seeded the server through the full pipeline', () => {
    const db = h.app.ports.db;
    expect(db.calls.size).toBe(5);
    expect([...db.chunks.values()].flat().length).toBeGreaterThanOrEqual(5);
    const langs = new Set([...db.chunks.values()].flat().map((c) => c.lang));
    expect(langs).toEqual(new Set(['en', 'he']));
    expect(h.app.ports.mockLlm.translated.length).toBeGreaterThanOrEqual(5);
    expect(db.vocab.length).toBeGreaterThan(0);
    expect(db.userData.size).toBeGreaterThanOrEqual(4);
    const recordings = [...db.calls.values()].flatMap((c) => (c.recording ? [c.recording] : []));
    expect(recordings).toHaveLength(1);
    expect(h.app.ports.blobStore.objects.has(recordings[0]!.objectKey)).toBe(true);
    expect(db.inbox.size).toBe(0);
  });

  it('finds no seeded word, name or number in any stored byte', () => {
    const list = needles();
    expect(list.length).toBeGreaterThan(40);
    const all = dump(h.app.ports);
    const db = h.app.ports.db;
    for (const c of db.calls.values()) {
      expect(all.includes(Buffer.from(c.id))).toBe(true);
      expect(all.includes(Buffer.from(c.transcriptCt))).toBe(true);
    }
    for (const blob of h.app.ports.blobStore.objects.values()) {
      expect(all.includes(Buffer.from(blob))).toBe(true);
    }
    expect(findLeaks(all, list)).toEqual([]);
  });

  it('would detect a leak in any encoding and in nested, unknown structures', () => {
    const list = needles();
    const planted = {
      newTable: new Map([['k', { deep: [{ v: Buffer.from('ולמקררים', 'utf16le') }] }]]),
      other: [new Set([`x${normalizeText('המקררים')}y`])],
      bytes: new TextEncoder().encode(`id:${ENGLISH_CALL.e164}`),
    };
    const leaks = findLeaks(dump(planted), list);
    expect(leaks).toEqual(
      expect.arrayContaining([`utf8:${normalizeText('המקררים')}`, `utf8:${ENGLISH_CALL.e164}`]),
    );
    expect(leaks.some((l) => l.startsWith('utf16le:'))).toBe(true);
  });
});
