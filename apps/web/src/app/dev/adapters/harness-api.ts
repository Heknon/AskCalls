import { planBatch } from '@askcalls/client-core/bulk/queue';
import { KeySession } from '@askcalls/client-core/session';
import {
  createPasskeyEntry,
  fromBase64Url,
  generateRootKey,
  generateSigningKeyPair,
  PRF_SALT,
  toBase64Url,
  toHex,
  unlockWithPasskey,
  utf8,
} from '@askcalls/crypto';
import { BrowserAudioCodec } from '@/client/adapters/audio/codec';
import { readOggOpus } from '@/client/adapters/audio/ogg';
import { WorkerEmbedder } from '@/client/adapters/embedder/embedder';
import { DeviceDb } from '@/client/adapters/idb';
import { WebAuthnPasskeyAuthenticator } from '@/client/adapters/passkey';
import { IdbBulkStateStore, IdbDeviceKeyStore, IdbSecretStore } from '@/client/adapters/stores';
import { createBrowserClient } from '@/client/browser-client';

/**
 * Functions the Playwright driver calls with `page.evaluate`. Inputs and outputs are plain
 * JSON; audio crosses as base64. Development only.
 */

const embedder = new WorkerEmbedder();
const codec = new BrowserAudioCodec();
const db = new DeviceDb('askcalls-dev-harness');

const dot = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i]!, 0);
const norm = (a: Float32Array) => Math.sqrt(dot(a, a));
const b64 = (s: string) =>
  fromBase64Url(s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));

export async function loadEmbedder() {
  const started = performance.now();
  const progress: number[] = [];
  const off = embedder.onStatus((s) => {
    if (s.state === 'loading') progress.push(s.progress.loaded);
  });
  const device = await embedder.load();
  off();
  const status = embedder.status;
  return {
    device,
    ms: Math.round(performance.now() - started),
    progressEvents: progress.length,
    loadMs: status.state === 'ready' ? status.loadMs : null,
  };
}

export async function embedPairs(texts: string[]) {
  const vectors = await embedder.embed(texts);
  const sim = vectors.map((a) => vectors.map((b) => dot(a, b)));
  return { dims: vectors.map((v) => v.length), norms: vectors.map(norm), sim };
}

/** Embeds `count` passages of ~120 words in batches; returns ms per passage. */
export async function embedBenchmark(count: number, words = 120) {
  const vocab =
    'call meeting price contract tomorrow office delivery payment invoice order phone number address week month update client'.split(
      ' ',
    );
  const texts = Array.from(
    { length: count },
    (_, i) =>
      `passage: ${Array.from({ length: words }, (_, j) => vocab[(i * 7 + j * 3) % vocab.length]).join(' ')}`,
  );
  await embedder.embed(texts.slice(0, 2));
  const started = performance.now();
  await embedder.embed(texts);
  const ms = performance.now() - started;
  return { count, msPerPassage: Math.round((ms / count) * 10) / 10, totalMs: Math.round(ms) };
}

export async function embedCancel() {
  const ac = new AbortController();
  const texts = Array.from({ length: 64 }, (_, i) => `passage: cancelled text number ${i}`);
  const p = embedder.embed(texts, { signal: ac.signal });
  ac.abort();
  try {
    await p;
    return { cancelled: false };
  } catch (e) {
    return { cancelled: (e as Error).name === 'AbortError' };
  }
}

function rms(pcm: Float32Array) {
  return Math.sqrt(pcm.reduce((s, x) => s + x * x, 0) / Math.max(1, pcm.length));
}

/** Dominant frequency by zero crossings (the fixtures are pure tones). */
function zeroCrossingHz(pcm: Float32Array, rate: number) {
  let n = 0;
  for (let i = 1; i < pcm.length; i++) if (pcm[i - 1]! < 0 !== pcm[i]! < 0) n++;
  return Math.round(n / 2 / (pcm.length / rate));
}

export async function decode(base64: string, mimeType: string, forceFfmpeg = false) {
  const c = forceFfmpeg ? new BrowserAudioCodec({ forceFfmpeg: true }) : codec;
  const started = performance.now();
  const audio = await c.decode(new Blob([b64(base64)], { type: mimeType }));
  const out = {
    path: c.lastDecodePath,
    sampleRate: audio.sampleRate,
    length: audio.pcm.length,
    durationSec: audio.durationSec,
    rms: rms(audio.pcm),
    hz: zeroCrossingHz(audio.pcm, audio.sampleRate),
    ms: Math.round(performance.now() - started),
  };
  if (forceFfmpeg) c.dispose();
  return out;
}

/** A 16 kHz mono test signal: a 440 Hz tone with silent gaps. */
function testSignal(seconds: number) {
  const pcm = new Float32Array(seconds * 16_000);
  for (let i = 0; i < pcm.length; i++) {
    const t = i / 16_000;
    pcm[i] = t % 2 < 1.6 ? 0.4 * Math.sin(2 * Math.PI * 440 * t) : 0;
  }
  return { pcm, sampleRate: 16_000 as const, durationSec: seconds };
}

async function decodeBack(bytes: Uint8Array) {
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: 16_000 });
  const buf = await ctx.decodeAudioData(bytes.slice().buffer);
  const pcm = buf.getChannelData(0);
  return { durationSec: buf.duration, rms: rms(pcm), hz: zeroCrossingHz(pcm, 16_000) };
}

export async function opusRoundTrip(seconds: number, forceFfmpeg = false) {
  const c = forceFfmpeg ? new BrowserAudioCodec({ forceFfmpeg: true }) : codec;
  const audio = testSignal(seconds);
  const out: Record<string, unknown> = { inputRms: rms(audio.pcm) };
  for (const kbps of [24, 32]) {
    const started = performance.now();
    const enc = await c.encodeOpus(audio, { bitrateKbps: kbps });
    const parsed = readOggOpus(enc.bytes);
    out[`kbps${kbps}`] = {
      mimeType: enc.mimeType,
      bytes: enc.bytes.length,
      actualKbps: Math.round((enc.bytes.length * 8) / seconds / 100) / 10,
      encodeMs: Math.round(performance.now() - started),
      preSkip: parsed.head.preSkip,
      packets: parsed.packets.length,
      finalGranule: Number(parsed.finalGranule),
      decoded: await decodeBack(enc.bytes),
    };
  }
  if (forceFfmpeg) c.dispose();
  return out;
}

export async function chunkRoundTrip(seconds: number, maxBytes: number) {
  const audio = testSignal(seconds);
  const chunks = await codec.chunk(audio, { maxBytes, bitrateKbps: 24 });
  const decoded = [];
  for (const c of chunks) decoded.push({ ...(await decodeBack(c.bytes)), startSec: c.startSec });
  return {
    sizes: chunks.map((c) => c.bytes.length),
    starts: chunks.map((c) => c.startSec),
    decoded,
  };
}

const authenticator = new WebAuthnPasskeyAuthenticator();

export async function passkeyRegister() {
  const r = await authenticator.create({ userName: 'harness@example.test', prfSalt: PRF_SALT });
  return { credentialId: r.credentialId, prf: r.prfOutput ? toHex(r.prfOutput) : null };
}

export async function passkeyAssert(credentialIds: string[]) {
  const r = await authenticator.assert({ credentialIds, prfSalt: PRF_SALT });
  return { credentialId: r.credentialId, prf: toHex(r.prfOutput) };
}

/** Registration + PRF wrap of a fresh root key, then an assertion that unwraps it. */
export async function passkeyUnlock() {
  const userId = 'harness-user';
  const rootKey = generateRootKey();
  const created = await authenticator.create({
    userName: 'harness@example.test',
    prfSalt: PRF_SALT,
  });
  if (!created.prfOutput) return { prf: false };
  const entry = await createPasskeyEntry({ userId, rootKey, prfOutput: created.prfOutput });
  const asserted = await authenticator.assert({
    credentialIds: [created.credentialId],
    prfSalt: PRF_SALT,
  });
  const unwrapped = await unlockWithPasskey({
    userId,
    prfOutput: asserted.prfOutput,
    wrappedRootKey: entry.wrappedRootKey,
    kdfParams: { ...entry.kdfParams },
  });
  return { prf: true, match: toHex(unwrapped) === toHex(rootKey) };
}

const harnessRootKey = () => utf8('harness-root-key-32-bytes-long!!');

/** Writes a wrapped blob, a non-extractable device key and an encrypted bulk state. */
export async function persistWrite() {
  const secrets = new IdbSecretStore(db);
  await secrets.set('wrapped-root-key', Uint8Array.of(9, 8, 7, 6));
  const pair = await generateSigningKeyPair({ extractable: false });
  await new IdbDeviceKeyStore(db).save('device-1', pair.privateKey);
  await secrets.set('device-public-key', pair.publicKey);
  const session = new KeySession({ idleTimeoutMs: 0 });
  await session.unlock({ userId: 'harness-user', rootKey: harnessRootKey() });
  const state = planBatch({
    items: [
      {
        key: 'k',
        name: 'Dana 0521234567',
        audio: { ref: 'file:x:Dana 0521234567.m4a', name: 'Dana 0521234567.m4a', size: 1 },
        transcript: null,
      },
    ],
    manifest: null,
  } as never);
  await new IdbBulkStateStore(db, session).save(state);
  return { ok: true };
}

/** After a reload: reads everything back and signs with the stored key. */
export async function persistRead() {
  const secrets = new IdbSecretStore(db);
  const wrapped = await secrets.get('wrapped-root-key');
  const device = await new IdbDeviceKeyStore(db).load();
  const pub = await secrets.get('device-public-key');
  let verified = false;
  if (device && pub) {
    const msg = new TextEncoder().encode('harness');
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      device.privateKey,
      msg,
    );
    const key = await crypto.subtle.importKey(
      'spki',
      pub as BufferSource,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    verified = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, msg);
  }
  const session = new KeySession({ idleTimeoutMs: 0 });
  await session.unlock({ userId: 'harness-user', rootKey: harnessRootKey() });
  const state = await new IdbBulkStateStore(db, session).load();
  return {
    wrapped: wrapped ? [...wrapped] : null,
    deviceKeyId: device?.deviceKeyId ?? null,
    extractable: device?.privateKey.extractable ?? null,
    verified,
    bulkItemName: state?.items[0]?.name ?? null,
  };
}

/** Raw dump of every IndexedDB store this origin uses, as base64 (for the plaintext scan). */
export async function dumpIndexedDb() {
  const out: string[] = [];
  for (const info of await indexedDB.databases()) {
    if (!info.name) continue;
    const idb = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(info.name!);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    for (const store of idb.objectStoreNames) {
      const values = await new Promise<unknown[]>((resolve, reject) => {
        const r = idb.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      for (const v of values) {
        if (v instanceof Uint8Array) out.push(toBase64Url(v));
        else out.push(JSON.stringify(v, (_, x) => (x instanceof Uint8Array ? toBase64Url(x) : x)));
      }
    }
    idb.close();
  }
  return out;
}

/** createBrowserClient wiring and the lock rules: unlock, then a pagehide locks. */
export async function lockOnPageHide() {
  const client = createBrowserClient({ dbName: 'askcalls-dev-harness-client' });
  await client.session.unlock({ userId: 'harness-user', rootKey: generateRootKey() });
  const png = fromBase64Url(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII',
  );
  const url = client.blobUrls.create(new Blob([png], { type: 'image/png' }));
  const loads = (u: string) =>
    new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = u;
    });
  const loadedBefore = await loads(url);
  const before = client.session.isUnlocked;
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
  const after = client.session.isUnlocked;
  const revoked = loadedBefore && !(await loads(url));
  client.dispose();
  return { before, after, revoked, hasEmbedder: client.ctx.embedder.dimensions === 384 };
}
