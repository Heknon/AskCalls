import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../../src/entities/errors';
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
        { ord: 0, lang: null, embedding: axisVector(1), snippetCt: rand(20) },
      ]);
      await s.search.upsertChunks(s.userA, b.id, [
        { ord: 0, lang: 'en', embedding: axisVector(2), snippetCt: rand(20) },
        { ord: 1, lang: 'he', embedding: axisVector(3, 0.1), snippetCt: rand(20) },
      ]);
      await s.search.upsertChunks(s.userA, c.id, [
        { ord: 0, lang: null, embedding: axisVector(4), snippetCt: rand(20) },
      ]);
      await s.search.upsertChunks(s.userB, foreign.id, [
        { ord: 0, lang: null, embedding: axisVector(3), snippetCt: rand(20) },
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
      expect(res.items[0]!.bestChunkLang).toBe('he');
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
        { ord: 0, lang: null, embedding: axisVector(3), snippetCt: rand(5) },
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

    it('returns a null language for chunks stored without one', async () => {
      const t = await seed();
      const res = await s.search.search(s.userA, {
        keywordGroups: [],
        vector: axisVector(1),
        limit: 1,
      });
      expect(res.items[0]!.id).toBe(t.a.id);
      expect(res.items[0]!.bestChunkLang).toBeNull();
    });

    it('replaces content, keyword tokens and chunks in one step', async () => {
      const t = await seed();
      const before = (await s.calls.get(s.userA, t.a.id))!;
      const [w9, transcriptCt, metaCt] = [randomTok(), rand(120), rand(90)];
      const after = await s.calls.replaceContent(
        s.userA,
        t.a.id,
        {
          transcriptCt,
          metaCt,
          keywordToks: [w9, t.w1],
          chunks: [
            { ord: 0, lang: 'he', embedding: axisVector(7), snippetCt: rand(8) },
            { ord: 1, lang: 'en', embedding: axisVector(8), snippetCt: rand(8) },
          ],
        },
        before.updatedAt,
      );
      expect(after.transcriptCt).toEqual(transcriptCt);
      expect(after.metaCt).toEqual(metaCt);
      expect(after.contentTok).toBe(before.contentTok);
      expect(after.tagToks).toEqual(before.tagToks);
      expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
      const stored = (await s.calls.get(s.userA, t.a.id))!;
      expect(stored.transcriptCt).toEqual(transcriptCt);
      expect([...stored.keywordToks].sort()).toEqual([w9, t.w1].sort());
      expect(
        ids((await s.search.search(s.userA, { keywordGroups: [[w9]], limit: 50 })).items),
      ).toEqual([t.a.id]);
      expect(
        ids((await s.search.search(s.userA, { keywordGroups: [[t.w2]], limit: 50 })).items),
      ).toEqual([t.b.id]);
      const hit = (
        await s.search.search(s.userA, { keywordGroups: [], vector: axisVector(8), limit: 1 })
      ).items[0]!;
      expect(hit.id).toBe(t.a.id);
      expect(hit.bestChunkOrd).toBe(1);
      expect(hit.bestChunkLang).toBe('en');
      const old = await s.search.search(s.userA, {
        keywordGroups: [],
        vector: axisVector(1),
        limit: 50,
      });
      expect(old.items.find((h) => h.id === t.a.id)!.score!).toBeLessThan(0.5);
    });

    it("refuses a re-index based on a stale read, and other users' calls", async () => {
      const t = await seed();
      const before = (await s.calls.get(s.userA, t.a.id))!;
      const content = {
        transcriptCt: rand(10),
        metaCt: rand(10),
        keywordToks: [randomTok()],
        chunks: [],
      };
      await s.calls.update(s.userA, t.a.id, { tagToks: [randomTok()] });
      const stale = new Date(before.updatedAt.getTime() - 1_000);
      await expect(s.calls.replaceContent(s.userA, t.a.id, content, stale)).rejects.toMatchObject({
        code: 'version_conflict',
      });
      expect((await s.calls.get(s.userA, t.a.id))!.transcriptCt).toEqual(before.transcriptCt);
      await expect(
        s.calls.replaceContent(s.userB, t.a.id, content, before.updatedAt),
      ).rejects.toBeInstanceOf(DomainError);
      await expect(
        s.calls.replaceContent(s.userB, t.a.id, content, before.updatedAt),
      ).rejects.toMatchObject({ code: 'not_found' });
    });
  });
}
