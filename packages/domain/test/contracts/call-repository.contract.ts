import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../../src/entities/errors';
import type { CallRepository } from '../../src/ports/repositories';
import { type Harness, makeCall, rand, randomTok } from './helpers';

export interface CallRepoSubject {
  calls: CallRepository;
  /** Two users that exist (foreign keys). */
  userA: string;
  userB: string;
}

export function describeCallRepositoryContract(name: string, harness: Harness<CallRepoSubject>) {
  describe(`CallRepository contract: ${name}`, () => {
    let s: CallRepoSubject;
    beforeEach(async () => {
      s = await harness.setup();
    });
    afterEach(async () => {
      await harness.teardown?.(s);
    });

    it('creates and reads back a call byte-for-byte', async () => {
      const c = makeCall(s.userA, { tagToks: [randomTok()] });
      await s.calls.create(c);
      const got = await s.calls.get(s.userA, c.id);
      expect(got).not.toBeNull();
      expect(got!.transcriptCt).toEqual(c.transcriptCt);
      expect(got!.metaCt).toEqual(c.metaCt);
      expect(got!.wrappedDek).toEqual(c.wrappedDek);
      expect(got!.keywordToks.sort()).toEqual([...c.keywordToks].sort());
      expect(got!.tagToks).toEqual(c.tagToks);
      expect(got!.contentTok).toBe(c.contentTok);
    });

    it("never returns another user's call", async () => {
      const c = makeCall(s.userA);
      await s.calls.create(c);
      expect(await s.calls.get(s.userB, c.id)).toBeNull();
      expect(await s.calls.delete(s.userB, c.id)).toBeNull();
      await expect(s.calls.update(s.userB, c.id, { metaCt: rand(4) })).rejects.toBeInstanceOf(
        DomainError,
      );
      expect((await s.calls.list(s.userB, {}, { limit: 50 })).items).toHaveLength(0);
      expect(await s.calls.get(s.userA, c.id)).not.toBeNull();
    });

    it("refuses an id that already exists, even another user's, without touching it", async () => {
      const c = makeCall(s.userA);
      await s.calls.create(c);
      await expect(s.calls.create(makeCall(s.userB, { id: c.id }))).rejects.toMatchObject({
        code: 'conflict',
      });
      expect((await s.calls.get(s.userA, c.id))?.metaCt).toEqual(c.metaCt);
      expect(await s.calls.get(s.userB, c.id)).toBeNull();
    });

    it('rejects duplicate content and audio tokens per user only', async () => {
      const contentTok = randomTok();
      const audioTok = randomTok();
      await s.calls.create(makeCall(s.userA, { contentTok, audioTok }));
      await expect(s.calls.create(makeCall(s.userA, { contentTok }))).rejects.toMatchObject({
        code: 'duplicate',
      });
      await expect(s.calls.create(makeCall(s.userA, { audioTok }))).rejects.toMatchObject({
        code: 'duplicate',
      });
      await s.calls.create(makeCall(s.userB, { contentTok, audioTok }));
      expect(await s.calls.findIdByContentTok(s.userA, contentTok)).not.toBeNull();
      expect(await s.calls.findIdByAudioTok(s.userB, audioTok)).not.toBeNull();
      expect(await s.calls.findIdByAudioTok(s.userA, randomTok())).toBeNull();
    });

    it('lists newest day first with cursor paging and filters', async () => {
      const star = randomTok();
      for (let d = 0; d < 7; d++) {
        await s.calls.create(makeCall(s.userA, { day: 20_000 + d, tagToks: d % 2 ? [star] : [] }));
      }
      const p1 = await s.calls.list(s.userA, {}, { limit: 3 });
      expect(p1.items.map((c) => c.day)).toEqual([20_006, 20_005, 20_004]);
      const p2 = await s.calls.list(s.userA, {}, { limit: 3, cursor: p1.nextCursor });
      expect(p2.items.map((c) => c.day)).toEqual([20_003, 20_002, 20_001]);
      const p3 = await s.calls.list(s.userA, {}, { limit: 3, cursor: p2.nextCursor });
      expect(p3.items).toHaveLength(1);
      expect(p3.nextCursor).toBeNull();

      const starred = await s.calls.list(s.userA, { tagToks: [star] }, { limit: 50 });
      expect(starred.items.map((c) => c.day)).toEqual([20_005, 20_003, 20_001]);
      const ranged = await s.calls.list(s.userA, { dayFrom: 20_002, dayTo: 20_003 }, { limit: 50 });
      expect(ranged.items.map((c) => c.day)).toEqual([20_003, 20_002]);
    });

    it('updates meta, tags and recording', async () => {
      const c = makeCall(s.userA);
      await s.calls.create(c);
      const tag = randomTok();
      const contact = randomTok();
      const updated = await s.calls.update(s.userA, c.id, {
        metaCt: rand(10),
        tagToks: [tag],
        contactTok: contact,
        recording: { bucketRef: null, objectKey: 'obj', bytes: 1234 },
      });
      expect(updated.tagToks).toEqual([tag]);
      expect(updated.contactTok).toBe(contact);
      expect((await s.calls.update(s.userA, c.id, { contactTok: null })).contactTok).toBeNull();
      expect(updated.recording).toEqual({ bucketRef: null, objectKey: 'obj', bytes: 1234 });
      expect(await s.calls.totalRecordingBytes(s.userA)).toBe(1234);
      const list = await s.calls.list(s.userA, {}, { limit: 10 });
      expect(list.items[0]!.hasRecording).toBe(true);
    });

    it('counts, deletes and finds calls before a day', async () => {
      const old = makeCall(s.userA, { day: 100 });
      const recent = makeCall(s.userA, { day: 20_000 });
      await s.calls.create(old);
      await s.calls.create(recent);
      expect(await s.calls.count(s.userA)).toBe(2);
      expect(await s.calls.listIdsBefore(s.userA, 1000, 10)).toEqual([old.id]);
      expect((await s.calls.delete(s.userA, old.id))?.id).toBe(old.id);
      expect(await s.calls.count(s.userA)).toBe(1);
    });
  });
}
