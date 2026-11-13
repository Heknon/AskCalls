import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs';
import { type FileHandle, mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * A POSIX tar (ustar, with pax records for long paths and large sizes) of files and directories:
 * the backup format of `askcalls backup` and the web bundle of the single binary. Readable by any
 * tar tool. Paths are relative, `/`-separated, and never contain `..`.
 */

const BLOCK = 512;
const MAX_OCTAL_SIZE = 0o77777777777;

export class TarFormatError extends Error {
  constructor(message: string) {
    super(`not a valid archive: ${message}`);
    this.name = 'TarFormatError';
  }
}

/** Relative, `/`-separated, no empty, `.` or `..` segment, no backslash or NUL. */
export function isSafeArchivePath(path: string): boolean {
  if (!path || path.length > 4096 || path.startsWith('/') || /[\\\0]/.test(path)) return false;
  return path.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

function octal(value: number, width: number): string {
  return `${value.toString(8).padStart(width - 1, '0')}\0`;
}

function header(name: string, size: number, mtime: number, type: '0' | '5' | 'x'): Uint8Array {
  const h = new Uint8Array(BLOCK);
  const enc = new TextEncoder();
  const put = (s: string, offset: number) => h.set(enc.encode(s), offset);
  put(name, 0);
  put(octal(type === '5' ? 0o755 : 0o644, 8), 100);
  put(octal(0, 8), 108);
  put(octal(0, 8), 116);
  put(octal(size, 12), 124);
  put(octal(Math.floor(mtime / 1000), 12), 136);
  put('        ', 148);
  put(type, 156);
  put('ustar\u000000', 257);
  let sum = 0;
  for (const b of h) sum += b;
  put(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return h;
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** `<length> <key>=<value>\n`, where length counts the bytes of the whole record. */
function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let len = byteLength(body) + 1;
  while (byteLength(`${len}${body}`) !== len) len = byteLength(`${len}${body}`);
  return `${len}${body}`;
}

const padding = (size: number) => new Uint8Array((BLOCK - (size % BLOCK)) % BLOCK);

export class TarWriter {
  #out: WriteStream;
  #closed = false;

  private constructor(out: WriteStream) {
    this.#out = out;
  }

  static async create(path: string): Promise<TarWriter> {
    await mkdir(dirname(path), { recursive: true });
    const out = createWriteStream(path, { mode: 0o600 });
    await new Promise<void>((resolve, reject) =>
      out.once('open', () => resolve()).once('error', reject),
    );
    return new TarWriter(out);
  }

  #write(chunk: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#out.write(chunk, (e) => (e ? reject(e) : resolve()));
    });
  }

  async #header(path: string, size: number, mtime: number, type: '0' | '5' = '0') {
    if (!isSafeArchivePath(path)) throw new TarFormatError(`unsafe path ${path}`);
    const name = type === '5' ? `${path}/` : path;
    const ascii = /^[\x20-\x7e]*$/.test(name);
    const records: string[] = [];
    if (name.length > 99 || !ascii) records.push(paxRecord('path', name));
    if (size > MAX_OCTAL_SIZE) records.push(paxRecord('size', String(size)));
    if (records.length) {
      const pax = new TextEncoder().encode(records.join(''));
      await this.#write(header('PaxHeader', pax.length, mtime, 'x'));
      await this.#write(pax);
      await this.#write(padding(pax.length));
    }
    const shortName = ascii ? name.slice(-99) : 'entry';
    await this.#write(header(shortName, Math.min(size, MAX_OCTAL_SIZE), mtime, type));
  }

  /** Adds an empty directory (a database's data directory needs its empty ones). */
  async addDirectory(path: string, mtime = Date.now()): Promise<void> {
    await this.#header(path, 0, mtime, '5');
  }

  /** Adds bytes held in memory. */
  async addBytes(path: string, bytes: Uint8Array, mtime = Date.now()): Promise<void> {
    await this.#header(path, bytes.length, mtime);
    await this.#write(bytes);
    await this.#write(padding(bytes.length));
  }

  /**
   * Streams a file into the archive and returns its SHA-256. Fails if the file is not exactly
   * `size` bytes long, so a file that changes while it is read never yields a broken archive.
   */
  async addFile(path: string, source: string, size: number, mtime: number): Promise<string> {
    await this.#header(path, size, mtime);
    const hash = createHash('sha256');
    let read = 0;
    for await (const chunk of createReadStream(source)) {
      const c = chunk as Buffer;
      read += c.length;
      if (read > size) break;
      hash.update(c);
      await this.#write(c);
    }
    if (read !== size) throw new Error(`${path} changed while it was archived`);
    await this.#write(padding(size));
    return hash.digest('hex');
  }

  async finish(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#write(new Uint8Array(BLOCK * 2));
    await new Promise<void>((resolve, reject) => {
      this.#out.end((e?: Error | null) => (e ? reject(e) : resolve()));
    });
  }

  async abort(): Promise<void> {
    this.#closed = true;
    if (this.#out.closed) return;
    await new Promise<void>((resolve) => {
      this.#out.once('close', () => resolve());
      this.#out.destroy();
    });
  }
}

export interface TarEntry {
  type: 'file' | 'directory';
  /** Without a trailing slash, also for directories. */
  path: string;
  size: number;
  /** Reads the whole entry into memory (small entries such as a manifest). */
  bytes(max: number): Promise<Uint8Array>;
  /** Copies the entry to `target` (created 0600) and returns its SHA-256. */
  extractTo(target: string): Promise<string>;
}

function readOctal(h: Uint8Array, offset: number, width: number): number {
  const s = new TextDecoder().decode(h.subarray(offset, offset + width)).replace(/[\0 ]+$/g, '');
  if (!/^[0-7]*$/.test(s.trim())) throw new TarFormatError('bad number field');
  return s.trim() ? Number.parseInt(s.trim(), 8) : 0;
}

function readString(h: Uint8Array, offset: number, width: number): string {
  const end = h.subarray(offset, offset + width).indexOf(0);
  return new TextDecoder().decode(h.subarray(offset, end === -1 ? offset + width : offset + end));
}

function parsePax(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  const dec = new TextDecoder();
  let i = 0;
  while (i < bytes.length) {
    const space = bytes.indexOf(0x20, i);
    const len = Number(dec.decode(bytes.subarray(i, space)));
    if (space === -1 || !Number.isInteger(len) || len <= 0 || i + len > bytes.length) {
      throw new TarFormatError('bad pax record');
    }
    const record = dec.decode(bytes.subarray(space + 1, i + len - 1));
    const eq = record.indexOf('=');
    out[record.slice(0, eq)] = record.slice(eq + 1);
    i += len;
  }
  return out;
}

async function readExactly(fh: FileHandle, position: number, length: number): Promise<Uint8Array> {
  const buf = new Uint8Array(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  if (bytesRead !== length) throw new TarFormatError('truncated');
  return buf;
}

/**
 * Reads the file and directory entries of an archive in order; links, devices and anything else
 * make it invalid. Each entry's content is valid only until the next one.
 */
export async function* readTar(path: string): AsyncGenerator<TarEntry> {
  const fh = await open(path, 'r');
  try {
    let pos = 0;
    let pax: Record<string, string> = {};
    for (;;) {
      const h = await readExactly(fh, pos, BLOCK);
      if (h.every((b) => b === 0)) return;
      let sum = 0;
      for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 32 : h[i]!;
      if (readOctal(h, 148, 8) !== sum) throw new TarFormatError('bad header checksum');
      const type = String.fromCharCode(h[156]!);
      const prefix = readString(h, 345, 155);
      const name = readString(h, 0, 100);
      const size = pax.size ? Number(pax.size) : readOctal(h, 124, 12);
      const dataAt = pos + BLOCK;
      pos = dataAt + size + ((BLOCK - (size % BLOCK)) % BLOCK);
      if (type === 'x') {
        pax = parsePax(await readExactly(fh, dataAt, size));
        continue;
      }
      const rawPath = pax.path ?? (prefix ? `${prefix}/${name}` : name);
      pax = {};
      if (type === 'g') continue;
      const entryType = type === '5' ? 'directory' : 'file';
      const entryPath = entryType === 'directory' ? rawPath.replace(/\/$/, '') : rawPath;
      if (type !== '0' && type !== '\0' && type !== '5') {
        throw new TarFormatError(`unsupported entry ${entryPath}`);
      }
      if (!isSafeArchivePath(entryPath)) throw new TarFormatError(`unsafe path ${entryPath}`);
      yield {
        type: entryType,
        path: entryPath,
        size,
        bytes: async (max) => {
          if (size > max) throw new TarFormatError(`${entryPath} is too large`);
          return readExactly(fh, dataAt, size);
        },
        extractTo: async (target) => {
          await mkdir(dirname(target), { recursive: true, mode: 0o700 });
          const out = await open(target, 'wx', 0o600);
          const hash = createHash('sha256');
          try {
            const chunk = new Uint8Array(1024 * 1024);
            for (let done = 0; done < size; ) {
              const n = Math.min(chunk.length, size - done);
              const { bytesRead } = await fh.read(chunk, 0, n, dataAt + done);
              if (bytesRead !== n) throw new TarFormatError('truncated');
              const part = chunk.subarray(0, n);
              hash.update(part);
              await out.write(part);
              done += n;
            }
          } finally {
            await out.close();
          }
          return hash.digest('hex');
        },
      };
    }
  } finally {
    await fh.close();
  }
}
