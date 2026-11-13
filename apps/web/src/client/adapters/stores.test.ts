import 'fake-indexeddb/auto';
import { planBatch } from '@askcalls/client-core/bulk/queue';
import { KeySession } from '@askcalls/client-core/session';
import { generateSigningKeyPair, randomBytes, utf8 } from '@askcalls/crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { DeviceDb, STORES } from './idb';
import { IdbBulkStateStore, IdbDeviceKeyStore, IdbSecretStore } from './stores';

let n = 0;
const freshDb = () => new DeviceDb(`test-${++n}`);
const opened: DeviceDb[] = [];
const db = () => {
  const d = freshDb();
  opened.push(d);
  return d;
};
afterEach(() => {
  for (const d of opened.splice(0)) d.close();
});

async function unlocked(userId = 'user-1') {
  const s = new KeySession({ idleTimeoutMs: 0 });
  await s.unlock({ userId, rootKey: randomBytes(32) });
  return s;
}

describe('IdbSecretStore', () => {
  it('stores bytes and survives a new connection', async () => {
    const d = db();
    await new IdbSecretStore(d).set('wrapped', Uint8Array.of(1, 2, 3));
    d.close();
    const again = new IdbSecretStore(new DeviceDb(d.name));
    expect(await again.get('wrapped')).toEqual(Uint8Array.of(1, 2, 3));
    await again.delete('wrapped');
    expect(await again.get('wrapped')).toBeNull();
  });
});

describe('IdbDeviceKeyStore', () => {
  it('keeps a non-extractable signing key by structured clone', async () => {
    const store = new IdbDeviceKeyStore(db());
    expect(await store.load()).toBeNull();
    const pair = await generateSigningKeyPair({ extractable: false });
    await store.save('dev-1', pair.privateKey);
    const loaded = await store.load();
    expect(loaded?.deviceKeyId).toBe('dev-1');
    expect(loaded?.privateKey.extractable).toBe(false);
    const msg = utf8('hello');
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      loaded!.privateKey,
      msg,
    );
    expect(sig.byteLength).toBe(64);
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it('refuses extractable keys', async () => {
    const pair = await generateSigningKeyPair({ extractable: true });
    await expect(new IdbDeviceKeyStore(db()).save('d', pair.privateKey)).rejects.toThrow();
  });
});

describe('IdbBulkStateStore', () => {
  const state = planBatch({
    items: [
      {
        key: 'call-0521234567',
        name: 'Dana Levi 0521234567',
        audio: { ref: 'dir:x:Dana Levi 0521234567.m4a', name: 'Dana Levi 0521234567.m4a', size: 9 },
        transcript: null,
      },
    ],
    manifest: null,
  } as never);

  it('round-trips the state encrypted: no file name reaches IndexedDB', async () => {
    const d = db();
    const session = await unlocked();
    const store = new IdbBulkStateStore(d, session);
    await store.save(state);
    expect(await store.load()).toEqual(state);
    const raw = await d.get<Uint8Array>(STORES.bulk, 'user-1');
    const text = new TextDecoder('latin1').decode(raw);
    expect(text).not.toContain('0521234567');
    expect(text).not.toContain('Dana');
  });

  it('reads nothing for another account and needs the session unlocked', async () => {
    const d = db();
    const a = await unlocked('user-a');
    await new IdbBulkStateStore(d, a).save(state);
    const b = await unlocked('user-b');
    expect(await new IdbBulkStateStore(d, b).load()).toBeNull();
    a.lock();
    await expect(new IdbBulkStateStore(d, a).load()).rejects.toThrow(/locked/);
  });

  it('a different root key cannot read it', async () => {
    const d = db();
    await new IdbBulkStateStore(d, await unlocked()).save(state);
    expect(await new IdbBulkStateStore(d, await unlocked()).load()).toBeNull();
  });
});
