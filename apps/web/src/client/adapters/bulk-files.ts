import type { FileRef } from '@askcalls/client-core/bulk/pairing';
import type { BulkFileReader } from '@askcalls/client-core/bulk/runner';
import { audioMimeType, openZip } from '@askcalls/client-core/bulk/zip';
import type { AudioSource } from '@askcalls/client-core/ports/index';
import { DomainError } from '@askcalls/domain';
import { type DeviceDb, STORES } from './idb';

/**
 * Where bulk-upload files come from in the browser (spec 8), behind client-core's
 * BulkFileReader. References are what the queue persists:
 *
 * - `dir:<id>:<path>`: a folder picked with the File System Access API. The directory handle is
 *   kept in IndexedDB, so after a reload the queue can resume once the user grants access again.
 * - `file:<session>:<path>`: files from an `<input>` or a drop, held in memory for this page.
 * - `zip:<session>:<name>!<entry>`: a ZIP unzipped on the device with client-core's `openZip`.
 *
 * Contents are read only when an item runs; nothing but handles reaches IndexedDB.
 */

type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>;
  queryPermission(d: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(d: { mode: 'read' }): Promise<PermissionState>;
};

export interface StoredDirectory {
  id: string;
  name: string;
  permission: PermissionState;
}

const randomId = () => crypto.randomUUID();

export const supportsDirectoryPicker = () =>
  typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

export class BrowserBulkFiles implements BulkFileReader {
  readonly #session = randomId();
  #files = new Map<string, File>();
  #dirs = new Map<string, DirHandle>();
  #zips = new Map<string, BulkFileReader>();

  constructor(private readonly db: DeviceDb) {}

  /** Opens the folder picker (needs a user gesture) and lists audio and transcript files. */
  async pickDirectory(): Promise<FileRef[]> {
    const pick = (globalThis as { showDirectoryPicker?: (o: object) => Promise<DirHandle> })
      .showDirectoryPicker;
    if (!pick) throw new DomainError('unsupported', 'folder picking is not available');
    return this.addDirectory(await pick({ mode: 'read', id: 'askcalls-bulk' }));
  }

  async addDirectory(handle: FileSystemDirectoryHandle): Promise<FileRef[]> {
    const id = randomId();
    const dir = handle as DirHandle;
    this.#dirs.set(id, dir);
    await this.db.put(STORES.handles, id, handle);
    const refs: FileRef[] = [];
    for await (const [path, file] of walk(dir, '')) {
      refs.push({ ref: `dir:${id}:${path}`, name: path, size: file.size });
    }
    return refs;
  }

  /** Files from `<input multiple>` (with `webkitdirectory`, paths are kept) or a drop. */
  addFiles(files: Iterable<File>): FileRef[] {
    const refs: FileRef[] = [];
    for (const f of files) {
      const name = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const ref = `file:${this.#session}:${name}`;
      this.#files.set(ref, f);
      refs.push({ ref, name, size: f.size });
    }
    return refs;
  }

  async addZip(file: File): Promise<FileRef[]> {
    const zipRef = `zip:${this.#session}:${file.name}`;
    const { files, reader } = openZip(new Uint8Array(await file.arrayBuffer()), zipRef);
    this.#zips.set(zipRef, reader);
    return files;
  }

  /** Folders remembered from earlier pages, with their current permission state. */
  async storedDirectories(): Promise<StoredDirectory[]> {
    const out: StoredDirectory[] = [];
    for (const id of await this.db.keys(STORES.handles)) {
      const h = await this.db.get<DirHandle>(STORES.handles, id);
      if (!h) continue;
      this.#dirs.set(id, h);
      out.push({ id, name: h.name, permission: await h.queryPermission({ mode: 'read' }) });
    }
    return out;
  }

  /** Asks again for read access to a remembered folder (needs a user gesture). */
  async requestAccess(id: string): Promise<boolean> {
    const h = this.#dirs.get(id) ?? (await this.db.get<DirHandle>(STORES.handles, id));
    if (!h) return false;
    this.#dirs.set(id, h);
    return (await h.requestPermission({ mode: 'read' })) === 'granted';
  }

  async forgetDirectory(id: string): Promise<void> {
    this.#dirs.delete(id);
    await this.db.delete(STORES.handles, id);
  }

  async forgetAll(): Promise<void> {
    this.#dirs.clear();
    this.#files.clear();
    this.#zips.clear();
    await this.db.clear(STORES.handles);
  }

  async audio(file: FileRef): Promise<AudioSource> {
    if (file.ref.startsWith('zip:')) return this.#zip(file).audio(file);
    const f = await this.#file(file);
    return f.type ? f : new Blob([f], { type: audioMimeType(file.name) });
  }

  async bytes(file: FileRef): Promise<Uint8Array> {
    if (file.ref.startsWith('zip:')) return this.#zip(file).bytes(file);
    return new Uint8Array(await (await this.#file(file)).arrayBuffer());
  }

  #zip(file: FileRef): BulkFileReader {
    const zipRef = file.ref.slice(0, file.ref.indexOf('!'));
    const r = this.#zips.get(zipRef);
    if (!r) throw new DomainError('not_found', 'pick the archive again to continue');
    return r;
  }

  async #file(file: FileRef): Promise<File> {
    if (file.ref.startsWith('file:')) {
      const f = this.#files.get(file.ref);
      if (!f) throw new DomainError('not_found', 'pick the files again to continue');
      return f;
    }
    const m = /^dir:([^:]+):(.+)$/.exec(file.ref);
    if (!m) throw new DomainError('invalid', 'unknown file reference');
    const dir = this.#dirs.get(m[1]!) ?? (await this.db.get<DirHandle>(STORES.handles, m[1]!));
    if (!dir) throw new DomainError('not_found', 'the folder is no longer available');
    if ((await dir.queryPermission({ mode: 'read' })) !== 'granted') {
      throw new DomainError('forbidden', 'allow access to the folder again to continue');
    }
    let cur: FileSystemDirectoryHandle = dir;
    const parts = m[2]!.split('/');
    for (const p of parts.slice(0, -1)) cur = await cur.getDirectoryHandle(p);
    return (await cur.getFileHandle(parts.at(-1)!)).getFile();
  }
}

async function* walk(dir: DirHandle, prefix: string): AsyncGenerator<[string, File]> {
  for await (const entry of dir.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      if (!entry.name.startsWith('.')) yield* walk(entry as DirHandle, path);
    } else if (!entry.name.startsWith('.')) {
      yield [path, await (entry as FileSystemFileHandle).getFile()];
    }
  }
}
