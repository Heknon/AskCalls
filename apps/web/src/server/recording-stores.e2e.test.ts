import {
  createClientContext,
  deleteCall,
  getCall,
  ingestCall,
  KeySession,
  managedTranscriber,
  Onboarding,
  readRecording,
} from '@askcalls/client-core';
import {
  movable,
  moveRecordings,
  storedRecordings,
  sweepOrphanedRecordings,
} from '@askcalls/client-core/recording-stores/move';
import { driveRef, switchRecordings } from '@askcalls/client-core/recording-stores/refs';
import { RecordingStores } from '@askcalls/client-core/recording-stores/router';
import { FakeGoogle } from '@askcalls/client-core/testing/fake-google';
import {
  FakeAudioCodec,
  fakeAudio,
  MemoryDeviceKeyStore,
} from '@askcalls/client-core/testing/fakes';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { blobTransport, type ClientHarness, startClientHarness } from './testing/client';
import { dump, findLeaks } from './testing/leak';

/**
 * Google Drive as the recording store, through the real route handlers and client-core: backup,
 * playback, moves both ways and the orphan sweep. Drive and Google's token endpoint are the
 * in-memory fake; the server reaches the fake only through the token pass-through.
 */

let h: ClientHarness;
let google: FakeGoogle;
let ctx: ReturnType<typeof createClientContext>;
let refreshToken: string;
const drive = () => ({ id: 'd1', refreshToken, folderId: null });

beforeAll(async () => {
  h = await startClientHarness({
    env: { STORAGE_GOOGLE_ID: 'drive-client', STORAGE_GOOGLE_SECRET: 'drive-secret' },
  });
  google = new FakeGoogle();
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://oauth2.googleapis.com/')) return google.fetch(url, init);
    return realFetch(input, init);
  });
  const api = h.app.client({ cookie: h.cookie });
  const session = new KeySession({ idleTimeoutMs: 0 });
  const ownStores = new RecordingStores({
    api,
    providers: () => ctx.userData.get('providers'),
    updateProviders: (m) => ctx.userData.update('providers', m),
    fetch: google.fetch,
  });
  ctx = createClientContext({
    api,
    session,
    embedder: h.embedder,
    audio: new FakeAudioCodec(),
    transcriber: managedTranscriber(api),
    clock: h.app.ports.clock,
    ...blobTransport(h.app.ports.blobStore),
    ownStores,
  });
  const o = await Onboarding.begin(h.userId);
  await o.addPassphrase('a long enough passphrase for tests');
  const [g1, g2] = o.confirmationGroups;
  o.confirmRecovery({ [g1]: o.recoveryGroups[g1]!, [g2]: o.recoveryGroups[g2]! });
  await o.finish({ api, session, deviceKeys: new MemoryDeviceKeyStore(false), deviceLabel: 'D' });
  ({ refreshToken } = google.issue());
  google.expireAccessTokens();
});

afterAll(() => {
  vi.restoreAllMocks();
  h.app.close();
});

const instanceObjects = () => [...h.app.ports.blobStore.objects.keys()];

describe('Google Drive recordings', () => {
  let callId = '';
  let plain: Uint8Array;

  it('backs up the encrypted recording to Drive, never to the instance bucket', async () => {
    await ctx.userData.update('providers', (p) =>
      switchRecordings(p, { mode: 'drive', drive: drive() }),
    );
    const before = instanceObjects().length;
    const payload = new Uint8Array(16_000 * 6).map((_, i) => (i * 13) % 251);
    const r = await ingestCall(ctx, {
      source: 'app',
      audio: { bytes: fakeAudio(payload), mimeType: 'audio/wav' },
      backupRecording: true,
    });
    expect(r).toMatchObject({ status: 'done', recording: 'stored' });
    callId = (r as { callId: string }).callId;
    const call = await getCall(ctx, callId);
    expect(call.recording?.bucketRef).toBe(driveRef(drive()));
    const file = google.files.get(call.recording!.objectKey)!;
    expect(file.bytes.length).toBe(call.recording!.bytes);
    expect(instanceObjects().length).toBe(before);
    plain = await readRecording(ctx, call);
    expect(plain.length).toBeGreaterThan(0);
    expect(findLeaks(Buffer.from(file.bytes), [Buffer.from(plain).toString('latin1')])).toEqual([]);
  });

  it('moves it to the instance bucket and back, ciphertext only', async () => {
    await ctx.userData.update('providers', (p) => switchRecordings(p, { mode: 'managed' }));
    const p1 = await ctx.userData.get('providers');
    const toManaged = movable(p1, await storedRecordings(ctx), null);
    expect(toManaged.map((r) => r.callId)).toEqual([callId]);
    expect(await moveRecordings(ctx, null, toManaged)).toEqual({ moved: 1, failed: 0 });
    const inInstance = await getCall(ctx, callId);
    expect(inInstance.recording?.bucketRef).toBeNull();
    expect([...google.files.values()].filter((f) => f.name.startsWith('askcalls-'))).toEqual([]);
    expect(await readRecording(ctx, inInstance)).toEqual(plain);

    await ctx.userData.update('providers', (p) =>
      switchRecordings(p, { mode: 'drive', drive: drive() }),
    );
    const p2 = await ctx.userData.get('providers');
    const toDrive = movable(p2, await storedRecordings(ctx), driveRef(drive()));
    expect(await moveRecordings(ctx, driveRef(drive()), toDrive)).toEqual({ moved: 1, failed: 0 });
    const back = await getCall(ctx, callId);
    expect(back.recording?.bucketRef).toBe(driveRef(drive()));
    expect(instanceObjects().some((k) => k.includes(callId))).toBe(false);
    expect(await readRecording(ctx, back)).toEqual(plain);
  });

  it('deletes the Drive file at the next sweep after the call is deleted', async () => {
    const call = await getCall(ctx, callId);
    await deleteCall(ctx, callId, call);
    expect(google.files.has(call.recording!.objectKey)).toBe(true);
    const mark = await sweepOrphanedRecordings(ctx, null);
    expect(mark).not.toBeNull();
    expect(google.files.has(call.recording!.objectKey)).toBe(false);
    expect(await sweepOrphanedRecordings(ctx, mark)).toBe(mark);
  });

  it('keeps the refresh token out of everything the server stores', () => {
    expect(findLeaks(dump(h.app.ports), [refreshToken])).toEqual([]);
  });
});
