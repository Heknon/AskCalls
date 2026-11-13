import { describe, expect, it } from 'vitest';
import { FakeGoogle } from '../testing/fake-google';
import { DRIVE_FOLDER_NAME, GoogleDriveStore } from './google-drive';
import type { DriveConfig } from './refs';

const REF = 'gdrive:d1';

function setup(opts: { folderId?: string | null } = {}) {
  const google = new FakeGoogle();
  const { refreshToken } = google.issue();
  google.expireAccessTokens();
  let drive: DriveConfig = { id: 'd1', refreshToken, folderId: opts.folderId ?? null };
  const refreshes: string[] = [];
  const saved: string[] = [];
  const store = new GoogleDriveStore({
    resolve: async () => drive,
    tokens: async (rt) => {
      refreshes.push(rt);
      const res = await google.fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt }),
      });
      const json = (await res.json()) as { access_token: string; expires_in: number };
      return { accessToken: json.access_token, expiresInSec: json.expires_in };
    },
    saveFolder: async (_ref, folderId) => {
      saved.push(folderId);
      drive = { ...drive, folderId };
    },
    fetch: google.fetch,
    uploadChunkBytes: 256 * 1024,
    downloadChunkBytes: 100_000,
  });
  return { google, store, refreshes, saved, drive: () => drive };
}

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7) % 251);

async function collect(it: AsyncIterable<Uint8Array>) {
  const parts: Uint8Array[] = [];
  for await (const p of it) parts.push(p);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return { out, parts: parts.length };
}

describe('Google Drive store', () => {
  it('creates the folder once, uploads in resumable chunks and keeps the folder id', async () => {
    const { google, store, saved } = setup();
    const body = bytes(600_000);
    const { objectKey } = await store.put(REF, 'call-1', body);
    const folder = [...google.files.values()].find((f) => f.name === DRIVE_FOLDER_NAME)!;
    expect(saved).toEqual([folder.id]);
    const file = google.files.get(objectKey)!;
    expect(file.name).toBe('askcalls-call-1.bin');
    expect(file.parents).toEqual([folder.id]);
    expect([...file.bytes]).toEqual([...body]);
    const puts = google.log.filter((l) => l.method === 'PUT');
    expect(puts).toHaveLength(3);

    await store.put(REF, 'call-2', bytes(10));
    expect([...google.files.values()].filter((f) => f.name === DRIVE_FOLDER_NAME)).toHaveLength(1);
  });

  it('finds a folder another device created instead of making a second one', async () => {
    const a = setup();
    await a.store.put(REF, 'c', bytes(5));
    const folderId = a.saved[0]!;
    const other = new GoogleDriveStore({
      resolve: async () => ({ ...a.drive(), folderId: null }),
      tokens: async () => {
        const t = a.google.issue();
        return { accessToken: t.accessToken, expiresInSec: 3600 };
      },
      fetch: a.google.fetch,
    });
    const { objectKey } = await other.put(REF, 'd', bytes(5));
    expect(a.google.files.get(objectKey)!.parents).toEqual([folderId]);
  });

  it('streams a download with ranged requests', async () => {
    const { google, store } = setup();
    const body = bytes(250_001);
    const { objectKey } = await store.put(REF, 'c', body);
    const { out, parts } = await collect(store.get(REF, objectKey));
    expect([...out]).toEqual([...body]);
    expect(parts).toBe(3);
    expect(google.log.filter((l) => l.method === 'GET' && l.path.endsWith(objectKey))).toHaveLength(
      3,
    );
  });

  it('refreshes the access token once on 401 and retries', async () => {
    const { google, store, refreshes } = setup();
    const { objectKey } = await store.put(REF, 'c', bytes(10));
    expect(refreshes).toHaveLength(1);
    google.expireAccessTokens();
    const { out } = await collect(store.get(REF, objectKey));
    expect(out.length).toBe(10);
    expect(refreshes).toHaveLength(2);
    expect(google.log.filter((l) => !l.authorized)).toHaveLength(1);
  });

  it('deletes, and treats a missing file as deleted', async () => {
    const { google, store } = setup();
    const { objectKey } = await store.put(REF, 'c', bytes(10));
    await store.delete(REF, objectKey);
    expect(google.files.has(objectKey)).toBe(false);
    await expect(store.delete(REF, objectKey)).resolves.toBeUndefined();
  });

  it('makes a new folder when the saved one was deleted in Drive', async () => {
    const { google, store, saved } = setup({ folderId: 'gone' });
    const { objectKey } = await store.put(REF, 'c', bytes(10));
    expect(google.files.get(objectKey)!.parents).toEqual([saved[0]]);
  });

  it('probes with a file it creates and deletes, and describes the account', async () => {
    const { google, store } = setup();
    expect(await store.probe(REF)).toEqual({ ok: true });
    expect([...google.files.values()].map((f) => f.name)).toEqual([DRIVE_FOLDER_NAME]);
    expect(await store.describe(REF)).toEqual({
      account: 'dana@example.test',
      location: DRIVE_FOLDER_NAME,
      usedBytes: 2_400_000_000,
      limitBytes: 15e9,
    });
  });

  it('reports a revoked grant as unauthorized', async () => {
    const google = new FakeGoogle();
    const store = new GoogleDriveStore({
      resolve: async () => ({ id: 'd1', refreshToken: 'nope', folderId: null }),
      tokens: async () => ({ accessToken: 'invalid', expiresInSec: 3600 }),
      fetch: google.fetch,
    });
    expect(await store.probe(REF)).toEqual({ ok: false, reason: 'unauthorized', status: 401 });
  });

  it('sends no cookies and talks only to www.googleapis.com', async () => {
    const google = new FakeGoogle();
    const { refreshToken, accessToken } = google.issue();
    const seen: Array<{ url: string; credentials: RequestCredentials | undefined }> = [];
    const store = new GoogleDriveStore({
      resolve: async () => ({ id: 'd1', refreshToken, folderId: null }),
      tokens: async () => ({ accessToken, expiresInSec: 3600 }),
      fetch: (url, init) => {
        seen.push({ url, credentials: init?.credentials });
        return google.fetch(url, init);
      },
    });
    const { objectKey } = await store.put(REF, 'c', bytes(3));
    await collect(store.get(REF, objectKey));
    await store.delete(REF, objectKey);
    expect(seen.every((s) => s.url.startsWith('https://www.googleapis.com/'))).toBe(true);
    expect(seen.every((s) => s.credentials === 'omit')).toBe(true);
  });
});
