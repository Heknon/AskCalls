import { DEFAULT_LIMITS } from '@askcalls/domain';
import { getMe } from '@askcalls/domain/use-cases/account';
import { getAccount, listAccounts, updateAccountLimits } from '@askcalls/domain/use-cases/admin';
import { createCall, getCall, presignRecordingUpload } from '@askcalls/domain/use-cases/calls';
import {
  askAboutCall,
  mintTranscriptionToken,
  transcribeChunk,
  translateSegments,
} from '@askcalls/domain/use-cases/providers';
import { createApiToken } from '@askcalls/domain/use-cases/tokens';
import { beforeEach, describe, expect, it } from 'vitest';
import { newCall, session, tokenActor } from '../testing/fixtures';
import { makeTestPorts, type TestPorts } from '../testing/ports';

let ports: TestPorts;
let admin: string;
let a: string;

beforeEach(async () => {
  ports = makeTestPorts({
    limits: { maxCalls: 1, maxApiTokens: 1, transcriptionMinutesPerMonth: 1, asksPerDay: 1 },
    translation: true,
  });
  admin = (await ports.users.create({ email: 'admin@example.test' })).id;
  await ports.users.setRole(admin, 'admin');
  a = (await ports.users.create({ email: 'a@example.test', name: 'A' })).id;
});

const setLimits = (patch: Parameters<typeof updateAccountLimits>[3]) =>
  updateAccountLimits(ports, session(admin), a, patch);

describe('admin accounts: authorization', () => {
  it('refuses a non-admin and a token on every use case', async () => {
    const asUser = session(a);
    await expect(listAccounts(ports, asUser, {})).rejects.toMatchObject({ code: 'forbidden' });
    await expect(getAccount(ports, asUser, a)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(updateAccountLimits(ports, asUser, a, { maxCalls: 9 })).rejects.toMatchObject({
      code: 'forbidden',
    });
    const token = tokenActor(admin, 'tok', ['read', 'write', 'ask', 'keys']);
    await expect(listAccounts(ports, token, {})).rejects.toMatchObject({ code: 'forbidden' });
    expect((await ports.users.findById(a))?.limitOverrides).toEqual({});
  });

  it('answers 404 for an unknown account', async () => {
    await expect(getAccount(ports, session(admin), 'nobody')).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      updateAccountLimits(ports, session(admin), 'nobody', { maxCalls: 2 }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('admin accounts: list and detail', () => {
  it('lists accounts newest first with usage, filtered by email and paged', async () => {
    await createCall(ports, session(a), newCall());
    await setLimits({ maxCalls: 10 });
    const page = await listAccounts(ports, session(admin), {});
    expect(page.items.map((x) => x.id)).toEqual([a, admin]);
    expect(page.items[0]).toMatchObject({
      email: 'a@example.test',
      name: 'A',
      plan: 'free',
      role: 'user',
      overridden: ['maxCalls'],
      usage: { calls: 1, recordingBytes: 0, apiTokens: 0, asksToday: 0 },
    });
    const filtered = await listAccounts(ports, session(admin), { email: ' ADMIN@ ' });
    expect(filtered.items.map((x) => x.id)).toEqual([admin]);
    const first = await listAccounts(ports, session(admin), { limit: 1 });
    expect(first.items.map((x) => x.id)).toEqual([a]);
    const second = await listAccounts(ports, session(admin), {
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(second.items.map((x) => x.id)).toEqual([admin]);
    expect(second.nextCursor).toBeNull();
    await expect(listAccounts(ports, session(admin), { limit: 101 })).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  it('returns only counts, sizes and account fields', async () => {
    await createCall(ports, session(a), newCall());
    const got = await getAccount(ports, session(admin), a);
    expect(Object.keys(got).sort()).toEqual(
      [
        'createdAt',
        'email',
        'id',
        'instanceLimits',
        'limits',
        'name',
        'overridden',
        'overrides',
        'plan',
        'role',
        'usage',
      ].sort(),
    );
    expect(got.instanceLimits).toEqual({ ...DEFAULT_LIMITS, ...ports.limits });
    expect(got.limits).toEqual(got.instanceLimits);
  });
});

describe('admin accounts: overrides', () => {
  it('validates values and audits field names on both accounts', async () => {
    await expect(setLimits({ maxCalls: -1 })).rejects.toMatchObject({ code: 'invalid' });
    await expect(setLimits({ maxCalls: 1.5 })).rejects.toMatchObject({ code: 'invalid' });
    const got = await setLimits({ maxCalls: 5, asksPerDay: 0 });
    expect(got.overrides).toEqual({ maxCalls: 5, asksPerDay: 0 });
    expect(got.limits).toMatchObject({ maxCalls: 5, asksPerDay: 0, maxApiTokens: 1 });
    const events = ports.db.audit.filter((e) => e.action === 'limits.update');
    expect(events.map((e) => [e.userId, e.meta])).toEqual([
      [a, { by: admin, fields: 'maxCalls,asksPerDay' }],
      [admin, { userId: a, fields: 'maxCalls,asksPerDay' }],
    ]);
    await setLimits({ maxCalls: 5 });
    expect(ports.db.audit.filter((e) => e.action === 'limits.update')).toHaveLength(2);
  });

  it('applies to calls, tokens, transcription, asks, translation, recordings and fetches', async () => {
    await createCall(ports, session(a), newCall());
    await expect(createCall(ports, session(a), newCall())).rejects.toMatchObject({
      code: 'quota_exceeded',
      details: { limit: 1, quota: 'calls' },
    });
    await createApiToken(ports, session(a), { name: 't1', scopes: ['read'], expiresInDays: null });
    await expect(
      createApiToken(ports, session(a), { name: 't2', scopes: ['read'], expiresInDays: null }),
    ).rejects.toMatchObject({ code: 'quota_exceeded', details: { quota: 'api_tokens' } });

    await setLimits({
      maxCalls: 3,
      maxApiTokens: 2,
      transcriptionMinutesPerMonth: 10,
      asksPerDay: 2,
      translationCharsPerMonth: 5,
      recordingBytes: 100,
      mcpFetchesPerTokenPerHour: 1,
    });

    const call = newCall();
    await createCall(ports, session(a), call);
    const t2 = await createApiToken(ports, session(a), {
      name: 't2',
      scopes: ['read'],
      expiresInDays: null,
    });

    const audio = new Uint8Array(96_000);
    const chunk = await transcribeChunk(ports, session(a), {
      audio,
      mimeType: 'audio/ogg',
      language: 'he',
    });
    expect(chunk.usage.limitSeconds).toBe(600);
    const direct = await mintTranscriptionToken(ports, session(a), { durationSec: 60 });
    expect(direct.usage.limitSeconds).toBe(600);

    const ask = { question: 'q', transcriptText: 't', consent: true };
    await askAboutCall(ports, session(a), ask);
    await askAboutCall(ports, session(a), ask);
    await expect(askAboutCall(ports, session(a), ask)).rejects.toMatchObject({
      code: 'rate_limited',
      details: { limit: 2, quota: 'asks' },
    });

    await expect(
      translateSegments(ports, session(a), { segments: ['abcdef'], source: 'he', target: 'en' }),
    ).rejects.toMatchObject({ code: 'quota_exceeded', details: { limit: 5 } });

    await expect(
      presignRecordingUpload(ports, session(a), call.id, { bytes: 101 }),
    ).rejects.toMatchObject({ code: 'quota_exceeded', details: { limit: 100 } });
    await presignRecordingUpload(ports, session(a), call.id, { bytes: 100 });

    const reader = tokenActor(a, t2.record.id, ['read']);
    await getCall(ports, reader, call.id);
    await expect(getCall(ports, reader, call.id)).rejects.toMatchObject({
      code: 'rate_limited',
      details: { limit: 1, quota: 'fetches' },
    });

    const me = await getMe(ports, session(a));
    expect(me.limits).toMatchObject({ maxCalls: 3, asksPerDay: 2, recordingBytes: 100 });
  });

  it('falls back to the instance limit once cleared', async () => {
    await setLimits({ maxCalls: 3, asksPerDay: 9 });
    const cleared = await setLimits({ maxCalls: null });
    expect(cleared.overrides).toEqual({ asksPerDay: 9 });
    expect(cleared.limits.maxCalls).toBe(1);
    expect(cleared.overridden).toEqual(['asksPerDay']);
    await createCall(ports, session(a), newCall());
    await expect(createCall(ports, session(a), newCall())).rejects.toMatchObject({
      code: 'quota_exceeded',
    });
    expect((await getMe(ports, session(a))).limits.maxCalls).toBe(1);
    const events = ports.db.audit.filter((e) => e.action === 'limits.update' && e.userId === a);
    expect(events.at(-1)?.meta).toEqual({ by: admin, fields: 'maxCalls' });
  });
});
