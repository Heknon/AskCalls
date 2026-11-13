import { deleteAccount, getMe, listAudit, setTelemetryConsent } from '@askcalls/domain/use-cases/account';
import { createCall, presignRecordingUpload, updateCall } from '@askcalls/domain/use-cases/calls';
import { appendVocab, compactVocab, listVocab } from '@askcalls/domain/use-cases/vocab';
import { getUserData, putUserData } from '@askcalls/domain/use-cases/userdata';
import { getRetention, setRetention } from '@askcalls/domain/use-cases/retention';
import {
  authenticateApiToken,
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from '@askcalls/domain/use-cases/tokens';
import { beforeEach, describe, expect, it } from 'vitest';
import { newCall, rand, session, tokenActor } from '../testing/fixtures';
import { makeTestPorts, type TestPorts } from '../testing/ports';

let ports: TestPorts;
let a: string;
let b: string;

beforeEach(async () => {
  ports = makeTestPorts();
  a = (await ports.users.create({ email: 'a@example.test' })).id;
  b = (await ports.users.create({ email: 'b@example.test' })).id;
});

describe('api tokens', () => {
  it('creates ac_ tokens shown once, stores only the hash, max 5', async () => {
    const created = await createApiToken(ports, session(a), {
      name: 'agent',
      scopes: ['read', 'read', 'write'],
      expiresInDays: 30,
    });
    expect(created.token).toMatch(/^ac_[A-Za-z0-9_-]{43}$/);
    expect(created.record.scopes).toEqual(['read', 'write']);
    const stored = [...ports.db.tokens.values()][0]!;
    expect(stored.tokenHash.length).toBe(32);
    expect(JSON.stringify([...ports.db.tokens.values()])).not.toContain(created.token.slice(3));
    const auth = await authenticateApiToken(ports, created.token);
    expect(auth.user.id).toBe(a);
    for (let i = 0; i < 4; i++) {
      await createApiToken(ports, session(a), { name: `t${i}`, scopes: ['read'], expiresInDays: null });
    }
    await expect(
      createApiToken(ports, session(a), { name: 'x', scopes: ['read'], expiresInDays: null }),
    ).rejects.toMatchObject({ code: 'quota_exceeded', details: { quota: 'api_tokens' } });
    await expect(
      createApiToken(ports, tokenActor(a, 't'), { name: 'x', scopes: ['read'], expiresInDays: null }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('rejects revoked, expired, malformed and unknown tokens', async () => {
    const { token, record } = await createApiToken(ports, session(a), {
      name: 'agent',
      scopes: ['read'],
      expiresInDays: 1,
    });
    await expect(authenticateApiToken(ports, 'ac_short')).rejects.toMatchObject({
      code: 'unauthorized',
    });
    await expect(
      authenticateApiToken(ports, `ac_${'A'.repeat(43)}`),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    ports.fixedClock.advance(86_400_001);
    await expect(authenticateApiToken(ports, token)).rejects.toMatchObject({ code: 'unauthorized' });
    ports.fixedClock.advance(-86_400_001);
    await expect(revokeApiToken(ports, session(b), record.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    await revokeApiToken(ports, session(a), record.id);
    await expect(authenticateApiToken(ports, token)).rejects.toMatchObject({ code: 'unauthorized' });
    expect((await listApiTokens(ports, session(a)))[0]?.revokedAt).toBeInstanceOf(Date);
    expect(await listApiTokens(ports, session(b))).toEqual([]);
  });
});

describe('me, consent, retention, audit', () => {
  it('summarizes the account without content', async () => {
    await createCall(ports, session(a), newCall());
    const me = await getMe(ports, session(a));
    expect(me.usage.calls).toBe(1);
    expect(me.limits.asksPerDay).toBe(50);
    expect(me.features.llm).toEqual({ enabled: true, provider: 'mock', model: 'mock-1' });
    expect(me.features.transcription.directTokens).toBe(true);
    expect(me.keyring.hasUserKeys).toBe(false);
  });

  it('stores consent and retention for the session user', async () => {
    expect(
      await setTelemetryConsent(ports, session(a), { productEvents: true, errorReports: false }),
    ).toEqual({ productEvents: true, errorReports: false });
    expect(await setRetention(ports, session(a), 90)).toEqual({ retentionDays: 90 });
    expect(await getRetention(ports, session(b))).toEqual({ retentionDays: null });
    await expect(setRetention(ports, session(a), 0)).rejects.toMatchObject({ code: 'invalid' });
    const audit = await listAudit(ports, session(a), {});
    expect(audit.items.map((e) => e.action)).toEqual(['retention.update']);
    expect((await listAudit(ports, session(b), {})).items).toEqual([]);
  });
});

describe('vocab and userdata', () => {
  it('appends, lists and compacts per user', async () => {
    const d1 = await appendVocab(ports, session(a), rand(10));
    const d2 = await appendVocab(ports, session(a), rand(10));
    expect((await listVocab(ports, session(a), d1.seq)).deltas.map((d) => d.seq)).toEqual([d2.seq]);
    expect((await listVocab(ports, session(b), 0)).count).toBe(0);
    await expect(compactVocab(ports, session(a), 99, rand(5))).rejects.toMatchObject({
      code: 'version_conflict',
    });
    await compactVocab(ports, session(a), d2.seq, rand(20));
    expect((await listVocab(ports, session(a), 0)).count).toBe(1);
  });

  it('enforces versions and kinds', async () => {
    expect(await getUserData(ports, session(a), 'tags')).toEqual({ kind: 'tags', ct: null, version: 0 });
    expect(await putUserData(ports, session(a), 'tags', { ct: rand(5), expectedVersion: 0 })).toEqual({
      version: 1,
    });
    await expect(
      putUserData(ports, session(a), 'tags', { ct: rand(5), expectedVersion: 0 }),
    ).rejects.toMatchObject({ code: 'version_conflict' });
    await expect(getUserData(ports, session(a), 'secrets')).rejects.toMatchObject({
      code: 'not_found',
    });
    expect((await getUserData(ports, session(b), 'tags')).version).toBe(0);
  });
});

describe('account deletion', () => {
  it('crypto-shreds rows and blobs and lists own-bucket recordings', async () => {
    const one = newCall();
    const two = newCall();
    await createCall(ports, session(a), one);
    await createCall(ports, session(a), two);
    const up = await presignRecordingUpload(ports, session(a), one.id, { bytes: 4 });
    await ports.blobs.put(up.objectKey, rand(4));
    await updateCall(ports, session(a), one.id, {
      recording: { bucketRef: null, objectKey: up.objectKey, bytes: 4 },
    });
    await updateCall(ports, session(a), two.id, {
      recording: { bucketRef: 'own', objectKey: 'k/1', bytes: 4 },
    });
    await ports.blobs.put(`inbox/${a}/x`, rand(4));
    await ports.blobs.put(`rec/${b}/y/z`, rand(4));
    await createCall(ports, session(b), newCall());

    const r = await deleteAccount(ports, session(a));
    expect(r).toEqual({ ownBucketRecordings: [{ bucketRef: 'own', objectKey: 'k/1' }], deletedBlobs: 2 });
    expect(await ports.users.findById(a)).toBeNull();
    expect(await ports.calls.count(a)).toBe(0);
    expect([...ports.blobStore.objects.keys()]).toEqual([`rec/${b}/y/z`]);
    expect(await ports.calls.count(b)).toBe(1);
    await expect(deleteAccount(ports, tokenActor(b, 't'))).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});
