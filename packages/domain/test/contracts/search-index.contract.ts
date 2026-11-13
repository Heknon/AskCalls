import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CallRepository } from '../../src/ports/repositories';
import type { SearchIndex } from '../../src/ports/search-index';
import { axisVector, type Harness, makeCall, rand, randomTok } from './helpers';

export interface SearchSubject {
  calls: CallRepository;
  search: SearchIndex;
  userA: string;
  userB: string;
}

export function describeSearchIndexContract(name: string, harness: Harness<SearchSubject>) {
  describe(`SearchIndex contract: ${name}`, () => {
    let s: SearchSubject;
    beforeEach(async () => {
      s = await harness.setup();
    });
    afterEach(async () => {
      await harness.teardown?.(s);
    });

    async function seed() {
      const [w1, w2, w3, w1typo] = [randomTok(), randomTok(), randomTok(), randomTok()];
      const [tagX, tagY, contact] = [randomTok(), randomTok(), randomTok()];
      const a = makeCall(s.userA, {
        day: 20_010,
        keywordToks: [w1, w2],
        tagToks: [tagX],
        contactTok: contact,
      });
      const b = makeCall(s.userA, { day: 20_005, keywordToks: [w2, w3], tagToks: [tagX, tagY] });
      const c = makeCall(s.userA, { day: 20_001, keywordToks: [w1typo, w3], tagToks: [tagY] });
      const foreign = makeCall(s.userB, {
        day: 20_020,
        keywordToks: [w1, w2, w3],
        tagToks: [tagX],
      });
      for (const call of [a, b, c, foreign]) await s.calls.create(call);
      await s.search.upsertChunks(s.userA, a.id, [
        { ord: 0, embedding: axisVector(1), snippetCt: rand(20) },
      ]);
      await s.search.upsertChunks(s.userA, b.id, [
        { ord: 0, embedding: axisVector(2), snippetCt: rand(20) },
        { ord: 1, embedding: axisVector(3, 0.1), snippetCt: rand(20) },
      ]);
      await s.search.upsertChunks(s.userA, c.id, [
        { ord: 0, embedding: axisVector(4), snippetCt: rand(20) },
      ]);
      await s.search.upsertChunks(s.userB, foreign.id, [
        { ord: 0, embedding: axisVector(3), snippetCt: rand(20) },
      ]);
      return { a, b, c, foreign, w1, w2, w3, w1typo, tagX, tagY, contact };
    }

    const ids = (hits: { id: string }[]) => hits.map((h) => h.id);

    it('ANDs keyword groups and ORs within a group', async () => {
      const t = await seed();
      const or = await s.search.search(s.userA, { keywordGroups: [[t.w1, t.w1typo]], limit: 50 });
      expect(ids(or.items)).toEqual([t.a.id, t.c.id]);
      const and = await s.search.search(s.userA, { keywordGroups: [[t.w2], [t.w3]], limit: 50 });
      expect(ids(and.items)).toEqual([t.b.id]);
    });

    it('filters by tags (AND), excluded tags, contacts and days', async () => {
      const t = await seed();
      expect(
        ids(
          (
            await s.search.search(s.userA, {
              keywordGroups: [],
              tagToks: [t.tagX, t.tagY],
              limit: 50,
            })
          ).items,
        ),
      ).toEqual([t.b.id]);
      expect(
        ids(
          (
            await s.search.search(s.userA, {
              keywordGroups: [],
              excludeTagToks: [t.tagY],
              limit: 50,
            })
          ).items,
        ),
      ).toEqual([t.a.id]);
      expect(
        ids(
          (
            await s.search.search(s.userA, {
              keywordGroups: [],
              contactToks: [t.contact],
              limit: 50,
            })
          ).items,
        ),
      ).toEqual([t.a.id]);
      expect(
        ids(
          (
            await s.search.search(s.userA, {
              keywordGroups: [],
              dayFrom: 20_002,
              dayTo: 20_009,
              limit: 50,
            })
          ).items,
        ),
      ).toEqual([t.b.id]);
    });

    it('orders by best chunk similarity when a vector is given and returns its snippet', async () => {
      const t = await seed();
      const res = await s.search.search(s.userA, {
        keywordGroups: [],
        vector: axisVector(3),
        limit: 2,
      });
      expect(res.items[0]!.id).toBe(t.b.id);
      expect(res.items[0]!.bestChunkOrd).toBe(1);
      expect(res.items[0]!.bestSnippetCt).toBeInstanceOf(Uint8Array);
      expect(res.items[0]!.score).toBeGreaterThan(0.9);
      expect(res.items).toHaveLength(2);
    });

    it("never returns another user's calls", async () => {
      const t = await seed();
      const res = await s.search.search(s.userA, {
        keywordGroups: [[t.w1]],
        vector: axisVector(3),
        limit: 50,
      });
      expect(ids(res.items)).not.toContain(t.foreign.id);
      const resB = await s.search.search(s.userB, { keywordGroups: [], limit: 50 });
      expect(ids(resB.items)).toEqual([t.foreign.id]);
    });

    it('pages without a vector by day descending', async () => {
      const t = await seed();
      const p1 = await s.search.search(s.userA, { keywordGroups: [], limit: 2 });
      expect(ids(p1.items)).toEqual([t.a.id, t.b.id]);
      const p2 = await s.search.search(s.userA, {
        keywordGroups: [],
        limit: 2,
        cursor: p1.nextCursor,
      });
      expect(ids(p2.items)).toEqual([t.c.id]);
      expect(p2.nextCursor).toBeNull();
    });

    it('replaces and deletes chunks', async () => {
      const t = await seed();
      await s.search.upsertChunks(s.userA, t.a.id, [
        { ord: 0, embedding: axisVector(3), snippetCt: rand(5) },
      ]);
      let res = await s.search.search(s.userA, {
        keywordGroups: [],
        vector: axisVector(3),
        limit: 1,
      });
      expect(res.items[0]!.id).toBe(t.a.id);
      await s.search.deleteChunks(s.userA, t.a.id);
      res = await s.search.search(s.userA, { keywordGroups: [], vector: axisVector(3), limit: 1 });
      expect(res.items[0]!.id).toBe(t.b.id);
    });
  });
}
