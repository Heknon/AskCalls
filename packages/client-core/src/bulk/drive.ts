import { DomainError } from '@askcalls/domain';
import {
  assertOk,
  defaultFetch,
  discard,
  type Fetch,
  readBody,
  send,
} from '../recording-stores/http';
import { DRIVE_ORIGIN, DRIVE_REF_PREFIX, isDriveRef } from './drive-ref';
import { classifyFile, type FileKind, type FileRef } from './pairing';
import type { BulkFileReader } from './runner';
import { audioMimeType } from './zip';

/**
 * Calls picked in the user's Google Drive (spec 8), read with Drive API v3 over fetch from the
 * device: Drive → device, never through AskCalls. Scope `drive.readonly` with online access:
 * one access token, held in memory for at most its hour and dropped by `clear()` on lock; no
 * refresh token exists. References are `gdrive:<fileId>:<path>`; contents are read when an item
 * runs.
 */

export { DRIVE_ORIGIN, isDriveRef } from './drive-ref';
export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const NATIVE_PREFIX = 'application/vnd.google-apps.';
/** Ids Drive hands out, plus the `root` alias. Anything else never reaches a query string. */
const DRIVE_ID = /^[A-Za-z0-9_-]{1,256}$/;
const MAX_WALK = 5_000;
/** Refreshing the hour-long token early leaves room for a download in flight. */
const EXPIRY_MARGIN_MS = 60_000;

export type DriveEntryKind = 'folder' | 'zip' | Exclude<FileKind, 'other'>;

export interface DriveEntry {
  id: string;
  name: string;
  kind: DriveEntryKind;
  /** Bytes; 0 for folders. */
  size: number;
}

export interface DriveListing {
  entries: DriveEntry[];
  nextPageToken: string | null;
}

export const driveRef = (id: string, path: string) => `${DRIVE_REF_PREFIX}${id}:${path}`;

interface DriveFile {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
}

function idOf(ref: string): string {
  const rest = ref.slice(DRIVE_REF_PREFIX.length);
  const id = rest.slice(0, rest.indexOf(':'));
  if (!isDriveRef(ref) || !DRIVE_ID.test(id)) {
    throw new DomainError('invalid', 'unknown file reference');
  }
  return id;
}

/** What an entry is to the import; null for what it can't use (Docs, images, other files). */
function kindOf(f: DriveFile): DriveEntryKind | null {
  if (f.mimeType === FOLDER_MIME) return 'folder';
  if (!f.name || f.mimeType?.startsWith(NATIVE_PREFIX)) return null;
  if (f.name.toLowerCase().endsWith('.zip')) return 'zip';
  const kind = classifyFile(f.name);
  return kind === 'other' ? null : kind;
}

const notConnected = () =>
  new DomainError('forbidden', 'connect Google Drive again to continue', { status: null });

export interface DriveImportOptions {
  fetch?: Fetch;
  now?: () => number;
}

export class DriveImport implements BulkFileReader {
  readonly #fetch: Fetch;
  readonly #now: () => number;
  #token: { value: string; expiresAt: number } | null = null;

  constructor(opts: DriveImportOptions = {}) {
    this.#fetch = opts.fetch ?? defaultFetch;
    this.#now = opts.now ?? Date.now;
  }

  /** Takes the access token the consent popup returned. */
  connect(token: { accessToken: string; expiresInSec: number }): void {
    this.#token = { value: token.accessToken, expiresAt: this.#now() + token.expiresInSec * 1000 };
  }

  /** Whether a token is held that won't expire within the next minute. */
  connected(): boolean {
    return !!this.#token && this.#token.expiresAt - EXPIRY_MARGIN_MS > this.#now();
  }

  clear(): void {
    this.#token = null;
  }

  async #get(url: string, what: string, headers: Record<string, string> = {}) {
    if (!this.connected()) throw notConnected();
    const res = await send(
      this.#fetch,
      url,
      { method: 'GET', headers: { ...headers, authorization: `Bearer ${this.#token!.value}` } },
      what,
    );
    if (res.status === 401) {
      await discard(res);
      this.#token = null;
      throw notConnected();
    }
    return assertOk(res, what);
  }

  /** One page of a folder: folders first, then what the import can read, by name. */
  async list(folderId = 'root', pageToken?: string): Promise<DriveListing> {
    if (!DRIVE_ID.test(folderId)) throw new DomainError('invalid', 'unknown folder');
    const q = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size)',
      orderBy: 'folder, name_natural',
      pageSize: '200',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      ...(pageToken && { pageToken }),
    });
    const res = await this.#get(`${DRIVE_ORIGIN}/drive/v3/files?${q}`, 'drive list');
    const json = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    const entries: DriveEntry[] = [];
    for (const f of json.files ?? []) {
      const kind = kindOf(f);
      if (!kind || !f.id || !DRIVE_ID.test(f.id)) continue;
      entries.push({ id: f.id, name: f.name!, kind, size: Number(f.size ?? 0) || 0 });
    }
    return { entries, nextPageToken: json.nextPageToken ?? null };
  }

  /**
   * The files under the picked entries, as queue references: a folder's whole tree under the
   * folder's name (so pairing and grouping by folder work as with a local folder), files by
   * their name. ZIPs come back apart, for the caller to download and open.
   */
  async collect(picked: readonly DriveEntry[]): Promise<{ files: FileRef[]; zips: FileRef[] }> {
    const files: FileRef[] = [];
    const zips: FileRef[] = [];
    const seen = new Set<string>();
    const add = (e: DriveEntry, path: string) => {
      if (seen.has(e.id)) return;
      seen.add(e.id);
      if (seen.size > MAX_WALK) throw new DomainError('invalid', 'too many files in Drive');
      const ref = { ref: driveRef(e.id, path), name: path, size: e.size };
      (e.kind === 'zip' ? zips : files).push(ref);
    };
    const walk = async (folderId: string, prefix: string) => {
      let page: string | undefined;
      do {
        const listing = await this.list(folderId, page);
        for (const e of listing.entries) {
          const path = `${prefix}/${e.name}`;
          if (e.kind === 'folder') {
            if (!seen.has(e.id)) {
              seen.add(e.id);
              await walk(e.id, path);
            }
          } else add(e, path);
        }
        page = listing.nextPageToken ?? undefined;
      } while (page);
    };
    for (const e of picked) {
      if (e.kind === 'folder') {
        seen.add(e.id);
        await walk(e.id, e.name);
      } else add(e, e.name);
    }
    return { files, zips };
  }

  async bytes(file: FileRef): Promise<Uint8Array> {
    const id = idOf(file.ref);
    const res = await this.#get(
      `${DRIVE_ORIGIN}/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
      'drive download',
    );
    return readBody(res);
  }

  async audio(file: FileRef) {
    return { bytes: await this.bytes(file), mimeType: audioMimeType(file.name) };
  }
}
