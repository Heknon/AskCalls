import { ApiError } from '@askcalls/api-contract';
import { uploadInbox } from '@askcalls/api-contract/routes/inbox';
import { listKeyring } from '@askcalls/api-contract/routes/keyring';
import {
  addUnlockMethod,
  applyAutoLockSetting,
  BulkQueue,
  checkDeviceLink,
  confirmDeviceLink,
  createBulkRunner,
  createClientContext,
  createTag,
  DeviceLinkJoiner,
  deleteCall,
  exportAll,
  getCall,
  ingestCall,
  KeySession,
  listCalls,
  Onboarding,
  pairFiles,
  parseManifest,
  planBatch,
  preflight,
  processInbox,
  readRecording,
  searchCalls,
  starCall,
  startDeviceLink,
  transcriptFile,
  unlock,
  unlockWithDevice,
  updateCallMeta,
  updateCallTags,
} from '@askcalls/client-core';
import {
  FakeEmbedder,
  FakePasskeys,
  fakeAudio,
  MemoryBulkStateStore,
} from '@askcalls/client-core/testing/fakes';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ClientDevice, type ClientHarness, startClientHarness } from './testing/client';
import { ENGLISH_CALL, HEBREW_CALL, INBOX_CALL, NOTES, TAG_NAME } from './testing/samples';

let h: ClientHarness;
let browser: ClientDevice;
let recoveryCode: string;
const ids = { en: '', he: '', inbox: '', audio: '' };

async function onboard(device: ClientDevice) {
  const o = await Onboarding.begin(h.userId);
  expect(o.recoveryGroups).toHaveLength(8);
  expect(await o.addPasskey(h.passkeys, { userName: 'owner', label: 'Laptop passkey' })).toEqual({
    added: true,
  });
  const [g1, g2] = o.confirmationGroups;
  expect(o.confirmRecovery({ [g1]: 'XXXX', [g2]: o.recoveryGroups[g2]! })).toBe(false);
  await expect(
    o.finish({
      api: device.ctx.api,
      session: device.session,
      deviceKeys: device.deviceKeys,
      deviceLabel: 'Laptop',
    }),
  ).rejects.toThrow(/confirm/);
  expect(
    o.confirmRecovery({ [g1]: o.recoveryGroups[g1]!.toLowerCase(), [g2]: o.recoveryGroups[g2]! }),
  ).toBe(true);
  await o.finish({
    api: device.ctx.api,
    session: device.session,
    deviceKeys: device.deviceKeys,
    deviceLabel: 'Laptop',
  });
  return o.recoveryCode;
}

const sortedIds = (r: Awaited<ReturnType<typeof searchCalls>>) => r.items.map((i) => i.id).sort();

beforeAll(async () => {
  h = await startClientHarness();
  browser = h.browser();
  recoveryCode = await onboard(browser);
});

afterAll(() => h.app.close());

describe('client-core end to end against the route handlers', () => {
  it('onboards: keyring rows, inbox keys and a device key on the server, session unlocked', () => {
    expect(browser.session.isUnlocked).toBe(true);
    expect(browser.session.device).not.toBeNull();
    const rows = [...h.app.ports.db.keyring.values()].filter((e) => e.userId === h.userId);
    expect(rows.map((r) => r.kind).sort()).toEqual(['passkey', 'recovery']);
    expect(h.app.ports.db.userKeys.get(h.userId)?.keyVersion).toBe(1);
    expect([...h.app.ports.db.devices.values()].map((d) => d.label)).toEqual(['Laptop']);
  });

  it('ingests English and Hebrew transcripts with manifest-style tags', async () => {
    const statuses: string[] = [];
    const en = await ingestCall(
      browser.ctx,
      {
        source: 'app',
        transcript: ENGLISH_CALL.text,
        transcriptFileName: ENGLISH_CALL.fileName,
        meta: {
          phone: ENGLISH_CALL.phone,
          startedAt: ENGLISH_CALL.startedAt,
          direction: 'out',
          contactName: ENGLISH_CALL.contactName,
          tags: [TAG_NAME],
        },
      },
      { onStatus: (s) => statuses.push(s) },
    );
    expect(en).toMatchObject({
      status: 'done',
      recording: 'none',
      vocabulary: 'updated',
      translation: 'none',
    });
    expect(statuses).toEqual(['indexing', 'encrypting', 'uploading']);
    const he = await ingestCall(browser.ctx, {
      source: 'app',
      transcript: new TextEncoder().encode(HEBREW_CALL.text),
      transcriptFileName: HEBREW_CALL.fileName,
      meta: { phone: HEBREW_CALL.phone, startedAt: HEBREW_CALL.startedAt, direction: 'in' },
    });
    expect(he.status).toBe('done');
    ids.en = (en as { callId: string }).callId;
    ids.he = (he as { callId: string }).callId;

    const again = await ingestCall(browser.ctx, { source: 'app', transcript: ENGLISH_CALL.text });
    expect(again).toEqual({ status: 'duplicate', existingId: ids.en, match: 'content' });
  });

  it('finds calls by exact keyword, typo, Hebrew prefix forms, contact and tag', async () => {
    const ctx = browser.ctx;
    expect(sortedIds(await searchCalls(ctx, { text: 'photovoltaic' }))).toEqual([ids.en]);
    const typo = await searchCalls(ctx, { text: 'contrakt' });
    expect(sortedIds(typo)).toEqual([ids.en]);
    expect(typo.alsoMatched).toContain('contract');
    expect(sortedIds(await searchCalls(ctx, { text: 'מקררים' }))).toEqual([ids.he]);
    expect(sortedIds(await searchCalls(ctx, { text: 'ולמקררים' }))).toEqual([ids.he]);
    expect(sortedIds(await searchCalls(ctx, { text: 'חולון' }))).toEqual([ids.he]);
    expect(sortedIds(await searchCalls(ctx, { text: 'photovoltaic מקררים' }))).toEqual([]);
    expect(sortedIds(await searchCalls(ctx, { contacts: ['0547654321'] }))).toEqual([ids.en]);
    expect(sortedIds(await searchCalls(ctx, { contacts: ['+97235551290'] }))).toEqual([ids.he]);
    expect(sortedIds(await searchCalls(ctx, { contacts: ['not a phone'] }))).toEqual([]);

    const directory = await ctx.tagDirectory();
    const tag = directory.findByName(TAG_NAME)!;
    const byTag = await searchCalls(ctx, { tagIds: [tag.id] });
    expect(sortedIds(byTag)).toEqual([ids.en]);
    expect(byTag.items[0]?.meta).toMatchObject({
      phoneE164: ENGLISH_CALL.e164,
      contactName: ENGLISH_CALL.contactName,
      direction: 'out',
    });
    expect(byTag.items[0]?.tags).toEqual([{ kind: 'tag', id: tag.id, tag }]);
    expect(
      sortedIds(await searchCalls(ctx, { dateFrom: new Date('2026-06-11T00:00:00Z') })),
    ).toEqual([ids.he]);
  });

  it('ranks by meaning with decrypted, highlighted snippets', async () => {
    const r = await searchCalls(browser.ctx, {
      text: 'photovoltaic panels price',
      semantic: true,
    });
    expect(r.items[0]?.id).toBe(ids.en);
    const top = r.items[0]!;
    expect(top.snippet).toContain('photovoltaic');
    const marked = top.highlights.map((x) => top.snippet!.slice(x.start, x.end).toLowerCase());
    expect(marked).toEqual(expect.arrayContaining(['photovoltaic', 'panels', 'price']));
  });

  it("drops meaning hits under the embedder's floor and ends the results there", async () => {
    const floored = createClientContext({
      api: browser.ctx.api,
      session: browser.session,
      embedder: new FakeEmbedder({ minSimilarity: 0.1 }),
    });
    const unrelated = { text: 'zebra giraffe', semantic: true, limit: 1 };
    expect((await searchCalls(browser.ctx, unrelated)).items).toHaveLength(1);
    expect(await searchCalls(floored, unrelated)).toMatchObject({ items: [], nextCursor: null });
    const related = await searchCalls(floored, { text: 'photovoltaic panels', semantic: true });
    expect(related.items.map((i) => i.id)).toEqual([ids.en]);
    expect(related.items[0]!.score).toBeGreaterThanOrEqual(0.1);
  });

  it('opens a call: decrypts, verifies the signature, exports TXT and SRT', async () => {
    const call = await getCall(browser.ctx, ids.en);
    expect(call.transcript.segments).toHaveLength(5);
    expect(call.meta.startedAt).toBe('2026-06-10T09:30:00.000Z');
    expect(call.signature).toMatchObject({ status: 'valid', deviceLabel: 'Laptop' });
    expect(transcriptFile(call, 'txt').content).toContain('photovoltaic');
    expect(transcriptFile(call, 'srt')).toMatchObject({
      fileName: `call-2026-06-10-${call.id.slice(-12)}.srt`,
    });
    const notes = await updateCallMeta(browser.ctx, call, { notes: NOTES, title: 'Quote call' });
    expect((await getCall(browser.ctx, ids.en)).meta).toMatchObject(notes);
  });

  it('stars and tags calls; the list decrypts rows lazily', async () => {
    const ctx = browser.ctx;
    const vip = await createTag(ctx.userData, { name: 'VIP', color: '#f59e0b' });
    const he = await getCall(ctx, ids.he);
    const starred = await starCall(ctx, he, true);
    await updateCallTags(ctx, { id: he.id, tagToks: starred }, { add: [vip.id] });

    expect(sortedIds(await searchCalls(ctx, { starred: true }))).toEqual([ids.he]);
    expect(sortedIds(await searchCalls(ctx, { tagIds: [vip.id], text: 'מקררים' }))).toEqual([
      ids.he,
    ]);
    const list = await listCalls(ctx, { starred: true });
    expect(list.items.map((i) => i.id)).toEqual([ids.he]);
    expect(list.items[0]?.starred).toBe(true);
    expect(list.items[0]?.tags.map((t) => t.kind).sort()).toEqual(['star', 'tag']);
    expect((await list.items[0]!.meta()).phoneE164).toBe(HEBREW_CALL.e164);

    const unstarred = await starCall(
      ctx,
      { id: he.id, tagToks: (await getCall(ctx, he.id)).tagToks },
      false,
    );
    expect(unstarred).toHaveLength(1);
    expect(sortedIds(await searchCalls(ctx, { starred: true }))).toEqual([]);
  });

  it('locks, refuses to work, and unlocks with the recovery code or the passkey', async () => {
    const { session, ctx } = browser;
    session.lock();
    expect(session.isUnlocked).toBe(false);
    await expect(searchCalls(ctx, { text: 'photovoltaic' })).rejects.toThrow(/locked/);
    const opts = { api: ctx.api, session, userId: h.userId, deviceKeys: browser.deviceKeys };
    await expect(unlock({ method: 'recovery', code: 'A'.repeat(32) }, opts)).rejects.toMatchObject({
      reason: 'wrong_key',
    });
    await unlock({ method: 'recovery', code: recoveryCode }, opts);
    expect(sortedIds(await searchCalls(ctx, { text: 'photovoltaic' }))).toEqual([ids.en]);

    expect(
      (
        await addUnlockMethod(
          { api: ctx.api, session },
          { method: 'passphrase', passphrase: 'correct horse battery staple' },
        )
      ).added,
    ).toBe(true);
    session.lock();
    await unlock({ method: 'passkey', authenticator: h.passkeys }, opts);
    expect(h.passkeys.lastAllowed).toEqual([
      { id: expect.any(String), transports: ['internal', 'hybrid'] },
    ]);
    session.lock();
    await unlock({ method: 'passphrase', passphrase: 'correct horse battery staple' }, opts);
    expect(sortedIds(await searchCalls(ctx, { text: 'ולמקררים' }))).toEqual([ids.he]);
  });

  it('adds no passkey when a password manager drops PRF, and says so', async () => {
    const { ctx, session } = browser;
    const before = (await ctx.api.request(listKeyring, {})).entries.length;
    expect(
      await addUnlockMethod(
        { api: ctx.api, session },
        {
          method: 'passkey',
          authenticator: new FakePasskeys('passwordManager'),
          userName: 'owner',
          label: 'Vault',
        },
      ),
    ).toEqual({ added: false, reason: 'passwordManager' });
    expect((await ctx.api.request(listKeyring, {})).entries.length).toBe(before);
  });

  it('applies the auto-lock setting to the session', async () => {
    const { ctx, session } = browser;
    await ctx.userData.update('settings', (d) => ({ ...d, autoLockMinutes: 5 }));
    await applyAutoLockSetting(ctx);
    expect(session.idleTimeoutMs).toBe(5 * 60_000);
    session.setIdleTimeout(0);
  });

  it('a new browser unlocked with the recovery code registers its own device key', async () => {
    const second = h.browser();
    await unlock(
      { method: 'recovery', code: recoveryCode },
      {
        api: second.ctx.api,
        session: second.session,
        userId: h.userId,
        deviceKeys: second.deviceKeys,
        registerDeviceLabel: 'Phone',
      },
    );
    expect(second.session.device?.deviceKeyId).toBeDefined();
    expect(sortedIds(await searchCalls(second.ctx, { text: 'photovoltaic' }))).toEqual([ids.en]);
  });

  it('processes an inbox item into a call and deletes the item', async () => {
    const res = await browser.ctx.api.request(uploadInbox, {
      body: {
        transcriptText: INBOX_CALL.text,
        phone: INBOX_CALL.phone,
        contactName: INBOX_CALL.contactName,
        direction: 'in',
      },
    });
    expect(res.visibleInTransit).toBe(true);
    const report = await processInbox(browser.ctx);
    expect(report).toEqual({ processed: 1, duplicates: 0, failed: [] });
    expect(h.app.ports.db.inbox.size).toBe(0);
    const found = await searchCalls(browser.ctx, { text: 'xylophonix' });
    expect(found.items).toHaveLength(1);
    expect(found.items[0]?.meta.phoneE164).toBe(INBOX_CALL.e164);
    ids.inbox = found.items[0]!.id;
    expect((await getCall(browser.ctx, ids.inbox)).source).toBe('inbox');
    expect(await processInbox(browser.ctx)).toEqual({ processed: 0, duplicates: 0, failed: [] });
  });

  it('transcribes audio, backs up the encrypted recording and detects audio duplicates', async () => {
    const payload = new Uint8Array(16_000 * 12).map((_, i) => (i * 7) % 251);
    const audio = { bytes: fakeAudio(payload), mimeType: 'audio/wav' };
    const statuses: string[] = [];
    const r = await ingestCall(
      browser.ctx,
      { source: 'app', audio, backupRecording: true, meta: { phone: '0501112233' } },
      { onStatus: (s) => statuses.push(s) },
    );
    expect(r).toMatchObject({ status: 'done', recording: 'stored' });
    expect(statuses).toEqual(['decoding', 'transcribing', 'indexing', 'encrypting', 'uploading']);
    ids.audio = (r as { callId: string }).callId;
    const call = await getCall(browser.ctx, ids.audio);
    expect(call.transcript.text).toContain('Mock segment at 5 seconds.');
    expect(call.recording?.bytes).toBeGreaterThan(payload.length);
    const plain = await readRecording(browser.ctx, call);
    expect(plain).toEqual(
      await browser.ctx
        .audio!.encodeOpus(await browser.ctx.audio!.decode(audio), { bitrateKbps: 32 })
        .then((e) => e.bytes),
    );

    const dup = await ingestCall(browser.ctx, { source: 'app', audio });
    expect(dup).toEqual({ status: 'duplicate', existingId: ids.audio, match: 'audio' });
    const notAudio = await ingestCall(browser.ctx, {
      source: 'app',
      audio: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'audio/wav' },
    });
    expect(notAudio).toEqual({ status: 'failed', reason: 'audio_unreadable' });
  });

  it('runs a bulk batch through the queue with a manifest', async () => {
    const files = new Map<string, Uint8Array>([
      [
        'batch/manifest.csv',
        new TextEncoder().encode('file,phone,tags\nnew-call.txt,0539876543,bulk\n'),
      ],
      [
        'batch/new-call.txt',
        new TextEncoder().encode('Agent: The Gondolieri order ships next week.'),
      ],
      ['batch/dup_tx.txt', new TextEncoder().encode(ENGLISH_CALL.text)],
      ['batch/broken.json', new TextEncoder().encode('{"nothing": true}')],
    ]);
    const refs = [...files].map(([name, b]) => ({ ref: name, name, size: b.length }));
    const reader = {
      bytes: async (f: { ref: string }) => files.get(f.ref)!,
      audio: async (f: { ref: string }) => ({ bytes: files.get(f.ref)!, mimeType: 'audio/ogg' }),
    };
    const pairing = pairFiles(refs);
    const summary = await preflight(browser.ctx, pairing, { reader });
    expect(summary).toMatchObject({ transcriptOnly: 3, audioOnly: 0, likelyDuplicates: 1 });
    expect(summary.unreadable).toHaveLength(1);

    const manifest = parseManifest(files.get('batch/manifest.csv')!);
    const store = new MemoryBulkStateStore();
    const q = await BulkQueue.create(planBatch(pairing), {
      store,
      run: createBulkRunner(browser.ctx, { reader, manifest, backupRecordings: false }),
    });
    q.start();
    await q.whenIdle();
    const status = Object.fromEntries(q.items.map((i) => [i.id, [i.status, i.reason]]));
    expect(status).toEqual({
      'batch/new-call': ['done', null],
      'batch/dup': ['duplicate', null],
      'batch/broken': ['failed', 'transcript_unreadable'],
    });
    const bulkTag = (await browser.ctx.tagDirectory()).findByName('bulk')!;
    const hits = await searchCalls(browser.ctx, { tagIds: [bulkTag.id], contacts: ['0539876543'] });
    expect(hits.items).toHaveLength(1);
    expect(JSON.stringify(store.state)).not.toContain('Gondolieri');
  });

  it('links an agent: fingerprints match, the agent unlocks from its keychain and signs calls', async () => {
    const agent = await h.agent();
    const started = await startDeviceLink(browser.ctx);
    const joiner = await DeviceLinkJoiner.join({
      api: agent.ctx.api,
      code: started.code,
      deviceLabel: 'askcalls agent',
      deviceKeys: agent.deviceKeys,
    });
    const status = await checkDeviceLink(browser.ctx.api, started);
    expect(status.state).toBe('waiting_for_confirmation');
    if (status.state !== 'waiting_for_confirmation') return;
    expect(status.fingerprint).toMatch(/^\d{6}$/);
    expect(status.fingerprint).toBe(joiner.fingerprint);
    const pollOpts = {
      session: agent.session,
      deviceKeys: agent.deviceKeys,
      storage: { kind: 'device-secret' as const, secrets: agent.secrets },
    };
    expect(await joiner.poll(pollOpts)).toEqual({ state: 'waiting_for_confirmation' });
    await confirmDeviceLink(browser.ctx, started, status.devicePublicKey);
    const done = await joiner.poll(pollOpts);
    expect(done.state).toBe('completed');
    expect(agent.session.isUnlocked).toBe(true);

    // A restarted agent process: a new session unlocked from the keychain alone.
    agent.session.lock();
    const session = new KeySession({ idleTimeoutMs: 0 });
    await unlockWithDevice({ session, secrets: agent.secrets, deviceKeys: agent.deviceKeys });
    expect(session.userId).toBe(h.userId);
    const agentCtx = createClientContext({ api: agent.ctx.api, session, embedder: h.embedder });
    expect(sortedIds(await searchCalls(agentCtx, { text: 'photovoltaic' }))).toEqual([ids.en]);

    const r = await ingestCall(agentCtx, {
      source: 'agent',
      transcript: 'Agent call about the Zanzibar shipment.',
    });
    expect(r.status).toBe('done');
    const viaBrowser = await getCall(browser.ctx, (r as { callId: string }).callId);
    expect(viaBrowser.signature).toMatchObject({ status: 'valid', deviceLabel: 'askcalls agent' });
  });

  it('links a second browser: RK in the session only, then protected by a passphrase', async () => {
    const other = h.browser();
    const started = await startDeviceLink(browser.ctx);
    const joiner = await DeviceLinkJoiner.join({
      api: other.ctx.api,
      code: started.code,
      deviceLabel: 'Firefox on Linux',
      deviceKeys: other.deviceKeys,
    });
    const status = await checkDeviceLink(browser.ctx.api, started);
    if (status.state !== 'waiting_for_confirmation') throw new Error(status.state);
    expect(status.fingerprint).toBe(joiner.fingerprint);
    await confirmDeviceLink(browser.ctx, started, status.devicePublicKey);
    const pollOpts = { session: other.session, deviceKeys: other.deviceKeys };
    expect((await joiner.poll({ ...pollOpts, storage: { kind: 'session' } })).state).toBe(
      'completed',
    );
    expect(other.session.isUnlocked).toBe(true);
    expect(sortedIds(await searchCalls(other.ctx, { text: 'photovoltaic' }))).toEqual([ids.en]);

    const passphrases = async () =>
      (await other.ctx.api.request(listKeyring, {})).entries.filter(
        (e) => e.kind === 'passphrase' && !e.revokedAt,
      ).length;
    const before = await passphrases();
    const passphrase = 'a long passphrase for the second browser';
    expect(
      await addUnlockMethod(other.ctx, { method: 'passphrase', passphrase, label: 'Passphrase' }),
    ).toEqual({ added: true });
    expect(await passphrases()).toBe(before + 1);
    const { devices } = await other.ctx.api.request(listKeyring, {});
    expect(devices.map((d) => d.label)).toContain('Firefox on Linux');
    other.session.lock();
    await unlock(
      { method: 'passphrase', passphrase },
      {
        api: other.ctx.api,
        session: other.session,
        userId: h.userId,
        deviceKeys: other.deviceKeys,
        registerDeviceLabel: 'Firefox on Linux',
      },
    );
    expect(other.session.isUnlocked).toBe(true);
  });

  it('exports everything decrypted as a ZIP', async () => {
    const zip = unzipSync(await exportAll(browser.ctx, { includeRecordings: true }));
    const names = Object.keys(zip);
    expect(names).toContain('tags.json');
    expect(
      names.filter((n) => n.endsWith('.json') && n.startsWith('calls/')).length,
    ).toBeGreaterThanOrEqual(5);
    expect(names.filter((n) => n.startsWith('recordings/'))).toHaveLength(1);
    const en = names.find(
      (n) =>
        n.startsWith('calls/') &&
        n.endsWith('.json') &&
        new TextDecoder().decode(zip[n]).includes('photovoltaic'),
    )!;
    expect(JSON.parse(new TextDecoder().decode(zip[en]))).toMatchObject({
      id: ids.en,
      tags: [TAG_NAME],
      meta: { notes: NOTES },
    });
  });

  it('deletes a call: gone from search and the server, vocabulary updated', async () => {
    const call = await getCall(browser.ctx, ids.he);
    await deleteCall(browser.ctx, ids.he, call);
    expect(sortedIds(await searchCalls(browser.ctx, { text: 'מקררים' }))).toEqual([]);
    await expect(getCall(browser.ctx, ids.he)).rejects.toBeInstanceOf(ApiError);
    expect(browser.ctx.vocabulary.vocabulary.has('מקררימ')).toBe(false);
    expect(browser.ctx.vocabulary.vocabulary.has('photovoltaic')).toBe(true);
  });
});
