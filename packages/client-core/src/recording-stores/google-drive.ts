import { type ApiClient, ApiError } from '@askcalls/api-contract';
import { storageToken } from '@askcalls/api-contract/routes/storage';
import { DomainError } from '@askcalls/domain';
import type { RecordingStore, RecordingStoreInfo, RecordingStoreProbe } from '../ports/index';
import type { Providers } from '../userdata';
import { assertOk, defaultFetch, discard, type Fetch, send } from './http';
import { type DriveConfig, driveRef, isDriveConfig } from './refs';

/** The visible Drive folder recordings go to. */
export const DRIVE_FOLDER_NAME = 'AskCalls recordings';

/** The only origin the device talks to for Drive: metadata, uploads and downloads. */
export const DRIVE_ORIGIN = 'https://www.googleapis.com';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Resumable upload chunks must be multiples of 256 KiB. */
const UPLOAD_CHUNK = 32 * 256 * 1024;
const DOWNLOAD_CHUNK = 4 * 1024 * 1024;

export interface DriveAccessToken {
  accessToken: string;
  expiresInSec: number;
}

/** Trades a refresh token for an access token. The client secret stays on the server. */
export type DriveTokenSource = (refreshToken: string) => Promise<DriveAccessToken>;

/** POST /api/storage/token/google, with the session cookie (browser) or a token (agent). */
export function serverDriveTokens(api: ApiClient): DriveTokenSource {
  return async (refreshToken) => {
    const r = await api.request(storageToken, {
      params: { provider: 'google' },
      body: { action: 'refresh', refreshToken },
    });
    if (r.action !== 'refresh') throw new DomainError('provider_error', 'unexpected response');
    return { accessToken: r.accessToken, expiresInSec: r.expiresInSec };
  };
}

export async function revokeDrive(api: ApiClient, refreshToken: string): Promise<void> {
  await api.request(storageToken, {
    params: { provider: 'google' },
    body: { action: 'revoke', refreshToken },
  });
}

export interface GoogleDriveStoreOptions {
  /** Maps a call's `bucketRef` to the decrypted Drive settings. */
  resolve: (ref: string) => Promise<DriveConfig>;
  tokens: DriveTokenSource;
  /** Keeps the folder id once created, so other devices reuse it. */
  saveFolder?: (ref: string, folderId: string) => Promise<void>;
  fetch?: Fetch;
  now?: () => number;
  /** Overridable for tests; production uses the fixed sizes above. */
  uploadChunkBytes?: number;
  downloadChunkBytes?: number;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

/**
 * Recordings in the user's Google Drive (spec 11.2a) with Drive API v3 over fetch, scope
 * `drive.file`: the app sees only files it created. Ciphertext goes from the device straight
 * to Drive; access tokens are kept in memory and dropped by `clear()` on lock.
 */
export class GoogleDriveStore implements RecordingStore {
  private readonly fetchImpl: Fetch;
  private readonly now: () => number;
  private readonly uploadChunk: number;
  private readonly downloadChunk: number;
  private readonly tokens = new Map<string, Promise<CachedToken>>();
  private readonly folders = new Map<string, Promise<string>>();

  constructor(private readonly opts: GoogleDriveStoreOptions) {
    this.fetchImpl = opts.fetch ?? defaultFetch;
    this.now = opts.now ?? Date.now;
    this.uploadChunk = opts.uploadChunkBytes ?? UPLOAD_CHUNK;
    this.downloadChunk = opts.downloadChunkBytes ?? DOWNLOAD_CHUNK;
  }

  clear(): void {
    this.tokens.clear();
    this.folders.clear();
  }

  /** Seeds the token the connect popup returned, so the first requests skip a refresh. */
  seedToken(refreshToken: string, token: DriveAccessToken): void {
    this.tokens.set(refreshToken, Promise.resolve(this.#cached(token)));
  }

  async put(ref: string, callId: string, body: Uint8Array): Promise<{ objectKey: string }> {
    const drive = await this.opts.resolve(ref);
    let folderId = await this.#folder(ref, drive);
    let res = await this.#startUpload(drive, folderId, callId, body.length);
    if (res.status === 404) {
      // The folder was deleted in Drive: make a new one.
      await discard(res);
      this.folders.delete(ref);
      folderId = await this.#folder(ref, { ...drive, folderId: null });
      res = await this.#startUpload(drive, folderId, callId, body.length);
    }
    await assertOk(res, 'drive upload');
    const session = res.headers.get('location');
    await discard(res);
    if (!session?.startsWith(`${DRIVE_ORIGIN}/`)) {
      throw new DomainError('provider_error', 'drive upload returned no session');
    }
    return { objectKey: await this.#uploadChunks(drive, session, body) };
  }

  async *get(ref: string, objectKey: string): AsyncGenerator<Uint8Array> {
    const drive = await this.opts.resolve(ref);
    const url = `${DRIVE_ORIGIN}/drive/v3/files/${encodeURIComponent(objectKey)}?alt=media`;
    let offset = 0;
    let total: number | null = null;
    while (total === null || offset < total) {
      const end = offset + this.downloadChunk - 1;
      const res = await this.#authed(drive, url, {
        method: 'GET',
        headers: { range: `bytes=${offset}-${end}` },
      });
      if (res.status === 416 && offset > 0) {
        await discard(res);
        return;
      }
      await assertOk(res, 'drive download');
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (res.status === 200) {
        // The server ignored the range and sent the whole file.
        yield bytes;
        return;
      }
      const range = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
      total = range ? Number(range[1]) : offset + bytes.length;
      if (bytes.length === 0) return;
      offset += bytes.length;
      yield bytes;
    }
  }

  async delete(ref: string, objectKey: string): Promise<void> {
    const drive = await this.opts.resolve(ref);
    const res = await this.#authed(
      drive,
      `${DRIVE_ORIGIN}/drive/v3/files/${encodeURIComponent(objectKey)}`,
      { method: 'DELETE' },
    );
    if (res.status !== 404) await assertOk(res, 'drive delete');
    await discard(res);
  }

  /** Test connection: creates and deletes an empty file in the recordings folder. */
  async probe(ref: string): Promise<RecordingStoreProbe> {
    try {
      const drive = await this.opts.resolve(ref);
      const folderId = await this.#folder(ref, drive);
      const res = await this.#authed(drive, `${DRIVE_ORIGIN}/drive/v3/files?fields=id`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'askcalls-test', parents: [folderId] }),
      });
      await assertOk(res, 'drive probe');
      const { id } = (await res.json()) as { id: string };
      await this.delete(ref, id);
      return { ok: true };
    } catch (e) {
      return probeFailure(e);
    }
  }

  async describe(ref: string): Promise<RecordingStoreInfo> {
    const drive = await this.opts.resolve(ref);
    const res = await this.#authed(
      drive,
      `${DRIVE_ORIGIN}/drive/v3/about?fields=${encodeURIComponent('user(emailAddress),storageQuota(limit,usage)')}`,
      { method: 'GET' },
    );
    await assertOk(res, 'drive about');
    const about = (await res.json()) as {
      user?: { emailAddress?: string };
      storageQuota?: { limit?: string; usage?: string };
    };
    const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);
    return {
      account: about.user?.emailAddress ?? null,
      location: DRIVE_FOLDER_NAME,
      usedBytes: num(about.storageQuota?.usage),
      limitBytes: num(about.storageQuota?.limit),
    };
  }

  #cached(t: DriveAccessToken): CachedToken {
    return { value: t.accessToken, expiresAt: this.now() + (t.expiresInSec - 60) * 1000 };
  }

  async #token(drive: DriveConfig, fresh = false): Promise<string> {
    const key = drive.refreshToken;
    let entry = fresh ? undefined : this.tokens.get(key);
    if (entry) {
      const t = await entry.catch(() => null);
      if (t && t.expiresAt > this.now()) return t.value;
    }
    entry = this.opts.tokens(key).then((t) => this.#cached(t));
    this.tokens.set(key, entry);
    entry.catch(() => this.tokens.delete(key));
    return (await entry).value;
  }

  /** One request with the access token; on 401 refreshes once and retries. */
  async #authed(drive: DriveConfig, url: string, init: RequestInit): Promise<Response> {
    const go = async (fresh: boolean) =>
      send(
        this.fetchImpl,
        url,
        {
          ...init,
          headers: {
            ...(init.headers as Record<string, string>),
            authorization: `Bearer ${await this.#token(drive, fresh)}`,
          },
        },
        'drive',
      );
    const res = await go(false);
    if (res.status !== 401) return res;
    await discard(res);
    return go(true);
  }

  #folder(ref: string, drive: DriveConfig): Promise<string> {
    let f = this.folders.get(ref);
    if (!f) {
      f = drive.folderId ? Promise.resolve(drive.folderId) : this.#findOrCreateFolder(ref, drive);
      this.folders.set(ref, f);
      f.catch(() => this.folders.delete(ref));
    }
    return f;
  }

  async #findOrCreateFolder(ref: string, drive: DriveConfig): Promise<string> {
    const q = `name = '${DRIVE_FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
    const list = await this.#authed(
      drive,
      `${DRIVE_ORIGIN}/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id)')}&pageSize=1&spaces=drive`,
      { method: 'GET' },
    );
    await assertOk(list, 'drive folder lookup');
    let id = ((await list.json()) as { files?: Array<{ id: string }> }).files?.[0]?.id;
    if (!id) {
      const res = await this.#authed(drive, `${DRIVE_ORIGIN}/drive/v3/files?fields=id`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: FOLDER_MIME }),
      });
      await assertOk(res, 'drive folder create');
      id = ((await res.json()) as { id: string }).id;
    }
    if (id !== drive.folderId) await this.opts.saveFolder?.(ref, id).catch(() => {});
    return id;
  }

  #startUpload(drive: DriveConfig, folderId: string, callId: string, size: number) {
    return this.#authed(
      drive,
      `${DRIVE_ORIGIN}/upload/drive/v3/files?uploadType=resumable&fields=id`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=UTF-8',
          'x-upload-content-type': 'application/octet-stream',
          'x-upload-content-length': String(size),
        },
        body: JSON.stringify({
          name: `askcalls-${callId}.bin`,
          parents: [folderId],
          mimeType: 'application/octet-stream',
        }),
      },
    );
  }

  /** Sends the body in chunks to the resumable session; Drive answers 308 until the last one. */
  async #uploadChunks(drive: DriveConfig, session: string, body: Uint8Array): Promise<string> {
    let offset = 0;
    let stalls = 0;
    for (;;) {
      const end = Math.min(offset + this.uploadChunk, body.length);
      const res = await this.#authed(drive, session, {
        method: 'PUT',
        headers: {
          'content-range':
            body.length === 0 ? 'bytes */0' : `bytes ${offset}-${end - 1}/${body.length}`,
        },
        body: body.subarray(offset, end) as BodyInit,
      });
      if (res.status === 308) {
        const range = /bytes=0-(\d+)/.exec(res.headers.get('range') ?? '');
        await discard(res);
        const next = range ? Number(range[1]) + 1 : 0;
        stalls = next > offset ? 0 : stalls + 1;
        if (stalls > 2) throw new DomainError('provider_error', 'drive upload made no progress');
        offset = next;
        continue;
      }
      await assertOk(res, 'drive upload');
      const { id } = (await res.json()) as { id?: string };
      if (!id) throw new DomainError('provider_error', 'drive upload returned no file id');
      return id;
    }
  }
}

/** Drive errors carry `details.status`; a refused refresh token comes back from our server. */
function probeFailure(e: unknown): RecordingStoreProbe {
  if (e instanceof DomainError) {
    const status = e.details.status;
    if (status === null) return { ok: false, reason: 'cors_or_network' };
    if (typeof status !== 'number') return { ok: false, reason: 'http' };
    if (status === 401 || status === 403) return { ok: false, reason: 'unauthorized', status };
    if (status === 404) return { ok: false, reason: 'not_found', status };
    return { ok: false, reason: 'http', status };
  }
  if (e instanceof ApiError && e.code === 'forbidden') {
    return { ok: false, reason: 'unauthorized', status: e.status };
  }
  return { ok: false, reason: 'http' };
}

/** Records the Drive folder a device created, on whichever entry holds that Drive. */
export function withDriveFolder(p: Providers, ref: string, folderId: string): Providers {
  const r = p.recordings;
  return {
    ...p,
    recordings:
      r.mode === 'drive' && driveRef(r.drive) === ref
        ? { mode: 'drive', drive: { ...r.drive, folderId } }
        : r,
    previousStores: p.previousStores.map((s) =>
      isDriveConfig(s) && driveRef(s) === ref ? { ...s, folderId } : s,
    ),
  };
}
