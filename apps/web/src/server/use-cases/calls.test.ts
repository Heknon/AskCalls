import { DomainError } from '@askcalls/domain';
import {
  createCall,
  deleteCall,
  getCall,
  listCalls,
  presignRecordingDownload,
  presignRecordingUpload,
  updateCall,
} from '@askcalls/domain/use-cases/calls';
import { runRetentionPurge } from '@askcalls/domain/use-cases/retention';
import { searchCalls } from '@askcalls/domain/use-cases/search';
import { beforeEach, describe, expect, it } from 'vitest';
import { newCall, randTok, session, tokenActor, vector } from '../testing/fixtures';
import { makeTestPorts, type TestPorts } from '../testing/ports';

let ports: TestPorts;
let a: string;
let b: string;

beforeEach(async () => {
  ports = makeTestPorts({ limits: { maxCalls: 3, recordingBytes: 1000 } });
  a = (await ports.users.create({ email: 'a@example.test' })).id;
  b = (await ports.users.create({ email: 'b@example.test' })).id;
});

const actions = (userId: string) =>
  ports.db.audit.filter((e) => e.userId === userId).map((e) => e.action);

describe('createCall', () => {
  it('creates the row and its chunks and audits', async () => {
    const input = newCall();
    await createCall(ports, session(a), input);
    expect(await ports.calls.get(a, input.id)).not.toBeNull();
    expect(ports.db.chunks.get(input.id)).toHaveLength(1);
    expect(actions(a)).toEqual(['call.create']);
  });

  it('reports the existing id for duplicate content and audio', async () => {
    const first = newCall({ audioTok: randTok() });
    await createCall(ports, session(a), first);
    await expect(
      createCall(ports, session(a), newCall({ contentTok: first.contentTok })),
    ).rejects.toMatchObject({
      code: 'duplicate',
      details: { existingId: first.id, match: 'content' },
    });
    await expect(
      createCall(ports, session(a), newCall({ audioTok: first.audioTok })),
    ).rejects.toMatchObject({
      code: 'duplicate',
      details: { existingId: first.id, match: 'audio' },
    });
    // Another user's identical content is not a duplicate.
    await createCall(ports, session(b), newCall({ contentTok: first.contentTok }));
  });

  it('enforces the free-tier call limit', async () => {
    for (let i = 0; i < 3; i++) await createCall(ports, session(a), newCall());
    await expect(createCall(ports, session(a), newCall())).rejects.toMatchObject({
      code: 'quota_exceeded',
      details: { quota: 'calls', limit: 3 },
    });
  });

  it("refuses another user's call id without touching it", async () => {
    const input = newCall();
    await createCall(ports, session(a), input);
    await expect(createCall(ports, session(b), newCall({ id: input.id }))).rejects.toMatchObject({
      code: 'conflict',
    });
    expect((await ports.calls.get(a, input.id))?.metaCt).toEqual(input.metaCt);
  });

  it('validates ids, embeddings and chunk order', async () => {
    await expect(createCall(ports, session(a), newCall({ id: 'nope' }))).rejects.toMatchObject({
      code: 'invalid',
    });
    const badVec = newCall({
      chunks: [{ ord: 0, embedding: new Float32Array(10), snippetCt: new Uint8Array(1) }],
    });
    await expect(createCall(ports, session(a), badVec)).rejects.toMatchObject({ code: 'invalid' });
    const dupOrd = newCall({
      chunks: [
        { ord: 0, embedding: vector(), snippetCt: new Uint8Array(1) },
        { ord: 0, embedding: vector(), snippetCt: new Uint8Array(1) },
      ],
    });
    await expect(createCall(ports, session(a), dupOrd)).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('listCalls and getCall', () => {
  it('scopes by user, filters and reports starred', async () => {
    const star = randTok();
    const starred = newCall({ tagToks: [star], day: 20_610 });
    await createCall(ports, session(a), starred);
    await createCall(ports, session(a), newCall({ day: 20_500 }));
    await createCall(ports, session(b), newCall());
    const all = await listCalls(ports, session(a), { starTok: star });
    expect(all.items.map((c) => c.starred)).toEqual([true, false]);
    const only = await listCalls(ports, session(a), { starTok: star, starredOnly: true });
    expect(only.items.map((c) => c.id)).toEqual([starred.id]);
    expect((await listCalls(ports, session(a), { dayFrom: 20_600 })).items).toHaveLength(1);
    expect((await listCalls(ports, session(b), {})).items).toHaveLength(1);
    await expect(listCalls(ports, session(a), { limit: 101 })).rejects.toBeInstanceOf(DomainError);
  });

  it('looks up a duplicate by token', async () => {
    const input = newCall({ audioTok: randTok() });
    await createCall(ports, session(a), input);
    const hit = await listCalls(ports, session(a), { audioTok: input.audioTok! });
    expect(hit.items.map((c) => c.id)).toEqual([input.id]);
    expect((await listCalls(ports, session(b), { audioTok: input.audioTok! })).items).toEqual([]);
  });

  it('audits reads, hides other users and spends the token fetch budget', async () => {
    const input = newCall();
    await createCall(ports, session(a), input);
    await expect(getCall(ports, session(b), input.id)).rejects.toMatchObject({ code: 'not_found' });
    const t = await ports.apiTokens.create({
      id: 'tok1',
      userId: a,
      name: 'agent',
      tokenHash: new Uint8Array(32),
      scopes: ['read'],
      expiresAt: null,
    });
    const actor = tokenActor(a, t.id, ['read']);
    for (let i = 0; i < 60; i++) await getCall(ports, actor, input.id);
    await expect(getCall(ports, actor, input.id)).rejects.toMatchObject({
      code: 'rate_limited',
      details: { quota: 'fetches' },
    });
    // Sessions have no fetch budget; the window resets after an hour.
    await getCall(ports, session(a), input.id);
    ports.fixedClock.advance(3_600_001);
    await getCall(ports, actor, input.id);
    expect(actions(a).filter((x) => x === 'call.read').length).toBe(62);
  });
});

describe('updateCall and recordings', () => {
  it('updates meta and tags for the owner only', async () => {
    const input = newCall();
    await createCall(ports, session(a), input);
    const tag = randTok();
    const updated = await updateCall(ports, session(a), input.id, { tagToks: [tag, tag] });
    expect(updated.tagToks).toEqual([tag]);
    await expect(updateCall(ports, session(b), input.id, { tagToks: [] })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('presigns uploads within the 2 GB quota and confirms uploaded blobs', async () => {
    const input = newCall();
    await createCall(ports, session(a), input);
    await expect(
      presignRecordingUpload(ports, session(a), input.id, { bytes: 1001 }),
    ).rejects.toMatchObject({ code: 'quota_exceeded', details: { quota: 'recording_bytes' } });
    const up = await presignRecordingUpload(ports, session(a), input.id, { bytes: 600 });
    expect(up.objectKey.startsWith(`rec/${a}/${input.id}/`)).toBe(true);
    const recording = { bucketRef: null, objectKey: up.objectKey, bytes: 600 };
    await expect(updateCall(ports, session(a), input.id, { recording })).rejects.toMatchObject({
      code: 'invalid',
    });
    await ports.blobs.put(up.objectKey, new Uint8Array(600));
    await updateCall(ports, session(a), input.id, { recording });
    expect(await ports.calls.totalRecordingBytes(a)).toBe(600);
    const dl = await presignRecordingDownload(ports, session(a), input.id);
    expect(dl.location).toBe('instance');

    // Replacing the recording counts only the new size and deletes the old blob.
    const up2 = await presignRecordingUpload(ports, session(a), input.id, { bytes: 900 });
    await ports.blobs.put(up2.objectKey, new Uint8Array(900));
    await updateCall(ports, session(a), input.id, {
      recording: { bucketRef: null, objectKey: up2.objectKey, bytes: 900 },
    });
    expect(await ports.blobs.exists(up.objectKey)).toBe(false);

    // A second call can't push the total past the quota.
    const other = newCall();
    await createCall(ports, session(a), other);
    await expect(
      presignRecordingUpload(ports, session(a), other.id, { bytes: 200 }),
    ).rejects.toMatchObject({ code: 'quota_exceeded' });
  });

  it('rejects recording keys of another call or user', async () => {
    const input = newCall();
    await createCall(ports, session(a), input);
    const key = `rec/${b}/${input.id}/x`;
    await ports.blobs.put(key, new Uint8Array(10));
    await expect(
      updateCall(ports, session(a), input.id, {
        recording: { bucketRef: null, objectKey: key, bytes: 10 },
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('deleteCall and retention', () => {
  it('deletes the row, chunks and blob; queues own-bucket recordings', async () => {
    const one = newCall();
    const two = newCall();
    await createCall(ports, session(a), one);
    await createCall(ports, session(a), two);
    const up = await presignRecordingUpload(ports, session(a), one.id, { bytes: 10 });
    await ports.blobs.put(up.objectKey, new Uint8Array(10));
    await updateCall(ports, session(a), one.id, {
      recording: { bucketRef: null, objectKey: up.objectKey, bytes: 10 },
    });
    await updateCall(ports, session(a), two.id, {
      recording: { bucketRef: 'mybucket', objectKey: 'calls/abc.ogg', bytes: 10 },
    });
    await expect(deleteCall(ports, session(b), one.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    await deleteCall(ports, session(a), one.id);
    expect(ports.db.chunks.has(one.id)).toBe(false);
    expect(await ports.blobs.exists(up.objectKey)).toBe(false);
    await deleteCall(ports, session(a), two.id);
    const orphan = ports.db.audit.find((e) => e.action === 'recording.orphaned');
    expect(orphan?.meta).toEqual({ bucketRef: 'mybucket', objectKey: 'calls/abc.ogg' });
  });

  it('purges old calls, expired inbox items, link sessions and quota counters', async () => {
    const today = Math.floor(ports.clock.now().getTime() / 86_400_000);
    const old = newCall({ day: today - 31 });
    const fresh = newCall({ day: today - 5 });
    await createCall(ports, session(a), old);
    await createCall(ports, session(a), fresh);
    const bOld = newCall({ day: today - 400 });
    await createCall(ports, session(b), bOld);
    await ports.users.update(a, { retentionDays: 30 });
    await ports.blobs.put('inbox/x/1', new Uint8Array(5));
    await ports.inbox.create({
      id: 'i1',
      userId: a,
      ephemeralPublicKey: new Uint8Array(65),
      payloadCt: null,
      blobKey: 'inbox/x/1',
      expiresAt: new Date(ports.clock.now().getTime() - 1),
    });
    const yesterday = {
      start: new Date(ports.clock.now().getTime() - 2 * 86_400_000),
      end: new Date(ports.clock.now().getTime() - 86_400_000),
    };
    await ports.rateLimiter.consume(`usage:ask:${a}`, yesterday, 1, null);
    const r = await runRetentionPurge(ports);
    expect(r).toEqual({
      usersProcessed: 1,
      callsDeleted: 1,
      inboxExpired: 1,
      linkSessionsExpired: 0,
      rateBucketsExpired: 1,
    });
    expect(await ports.rateLimiter.usage(`usage:ask:${a}`, yesterday.start)).toBe(0);
    expect(await ports.calls.get(a, old.id)).toBeNull();
    expect(await ports.calls.get(a, fresh.id)).not.toBeNull();
    expect(await ports.calls.get(b, bOld.id)).not.toBeNull();
    expect(await ports.blobs.exists('inbox/x/1')).toBe(false);
    expect(ports.db.audit.find((e) => e.action === 'retention.purge')).toMatchObject({
      actor: 'system',
      meta: { calls: 1 },
    });
  });
});

describe('searchCalls', () => {
  it('validates spec 9.1 bounds and scopes results', async () => {
    const kw = randTok();
    const mine = newCall({ keywordToks: [kw] });
    await createCall(ports, session(a), mine);
    await createCall(ports, session(b), newCall({ keywordToks: [kw] }));
    const r = await searchCalls(ports, session(a), { keywordGroups: [[kw]], limit: 10 });
    expect(r.items.map((h) => h.id)).toEqual([mine.id]);
    const sem = await searchCalls(ports, session(a), {
      keywordGroups: [],
      vector: vector(1),
      limit: 5,
    });
    expect(sem.items[0]?.bestSnippetCt).toBeInstanceOf(Uint8Array);
    for (const limit of [0, 51]) {
      await expect(
        searchCalls(ports, session(a), { keywordGroups: [], limit }),
      ).rejects.toMatchObject({ code: 'invalid' });
    }
    await expect(
      searchCalls(ports, session(a), {
        keywordGroups: [],
        vector: new Float32Array(383),
        limit: 5,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      searchCalls(ports, session(a), { keywordGroups: [[]], limit: 5 }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(actions(a)).toContain('call.search');
  });
});
