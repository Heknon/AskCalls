import { randomBytes } from 'node:crypto';
import type { Dirent } from 'node:fs';
import {
  link,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rmdir,
  stat,
  unlink,
} from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { BlobStore, HealthResult, PresignedRequest } from '@askcalls/domain';
import { DomainError } from '@askcalls/domain';
import { keySegments, OBJECT_SUFFIX, prefixParts } from './keys';
import {
  type BlobMethod,
  buildSignedBlobUrl,
  importSigningKey,
  type VerifyResult,
  verifyBlobUrl,
} from './signing';

export interface FsBlobStoreOptions {
  /** Root directory. Created with mode 0700 if missing. Must be an absolute or cwd-relative path. */
  dir: string;
  /** App origin that serves `/api/blob/<key>`, e.g. `http://localhost:3000`. */
  baseUrl: string;
  /**
   * HMAC secret for presigned URLs (at least 32 bytes). When omitted, a random key is created once
   * in `<dir>/.signing-key` (mode 0600) and reused, so URLs survive restarts.
   */
  signingSecret?: Uint8Array;
}

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const SIGNING_KEY_FILE = '.signing-key';
/** Longest presign lifetime accepted (7 days, same as S3). */
const MAX_EXPIRES_SEC = 7 * 24 * 3600;

const isErrno = (e: unknown, code: string) => (e as NodeJS.ErrnoException | null)?.code === code;

/**
 * BlobStore on local disk (dev, self-host, local mode). Stores ciphertext only.
 *
 * - Keys map to `<dir>/<seg>/.../<last>.blob`; every segment is validated (see keys.ts) and the
 *   resolved path is checked to stay inside the root, so traversal is impossible.
 * - Writes are atomic: a temp file in the same directory, fsync, then rename.
 * - Directories are 0700 and files 0600 (owner only).
 * - Presigned URLs are HMAC-signed app URLs (signing.ts); the route that serves them is built in
 *   the API bucket and calls `verifyPresigned` before `put`/`get`.
 */
export class FsBlobStore implements BlobStore {
  readonly root: string;
  private readonly baseUrl: string;
  private signingKey: Promise<CryptoKey> | null = null;
  private readonly secret: Uint8Array | undefined;

  constructor(opts: FsBlobStoreOptions) {
    this.root = resolve(opts.dir);
    this.baseUrl = opts.baseUrl;
    this.secret = opts.signingSecret;
  }

  private pathFor(key: string): { dir: string; file: string } {
    const segments = keySegments(key);
    const last = segments.pop()!;
    const dir = join(this.root, ...segments);
    const file = join(dir, last + OBJECT_SUFFIX);
    if (!file.startsWith(this.root + sep))
      throw new DomainError('invalid', 'Blob key escapes root');
    return { dir, file };
  }

  async put(key: string, body: Uint8Array): Promise<void> {
    const { dir, file } = this.pathFor(key);
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
    const tmp = join(dir, `.tmp-${randomBytes(12).toString('hex')}`);
    const fh = await open(tmp, 'wx', FILE_MODE);
    try {
      await fh.writeFile(body);
      await fh.sync();
    } catch (e) {
      await fh.close();
      await unlink(tmp).catch(() => {});
      throw e;
    }
    await fh.close();
    try {
      await rename(tmp, file);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      throw e;
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    const { file } = this.pathFor(key);
    try {
      return new Uint8Array(await readFile(file));
    } catch (e) {
      if (isErrno(e, 'ENOENT') || isErrno(e, 'ENOTDIR')) return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    const { file } = this.pathFor(key);
    try {
      await unlink(file);
    } catch (e) {
      if (!isErrno(e, 'ENOENT') && !isErrno(e, 'ENOTDIR')) throw e;
    }
  }

  async deletePrefix(prefix: string): Promise<number> {
    const { dirSegments, rest } = prefixParts(prefix);
    const start = join(this.root, ...dirSegments);
    const keyBase = dirSegments.length ? `${dirSegments.join('/')}/` : '';
    let count = 0;

    const walk = async (dir: string, base: string, top: boolean): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (e) {
        if (isErrno(e, 'ENOENT') || isErrno(e, 'ENOTDIR')) return;
        throw e;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // temp files and the signing key
        // At the top level only names matching the partial segment are candidates.
        if (top && !entry.name.startsWith(rest)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full, `${base}${entry.name}/`, false);
          await rmdir(full).catch(() => {}); // only succeeds when empty
        } else if (entry.isFile() && entry.name.endsWith(OBJECT_SUFFIX)) {
          const key = base + entry.name.slice(0, -OBJECT_SUFFIX.length);
          if (!key.startsWith(prefix)) continue;
          await unlink(full).catch((e) => {
            if (!isErrno(e, 'ENOENT')) throw e;
          });
          count++;
        }
      }
    };
    await walk(start, keyBase, true);
    // Prune the starting directory and its ancestors while they are empty.
    for (let i = dirSegments.length; i > 0; i--) {
      const removed = await rmdir(join(this.root, ...dirSegments.slice(0, i))).then(
        () => true,
        () => false,
      );
      if (!removed) break;
    }
    return count;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.size(key)) !== null;
  }

  async size(key: string): Promise<number | null> {
    const { file } = this.pathFor(key);
    try {
      const s = await stat(file);
      return s.isFile() ? s.size : null;
    } catch (e) {
      if (isErrno(e, 'ENOENT') || isErrno(e, 'ENOTDIR')) return null;
      throw e;
    }
  }

  async presignPut(
    key: string,
    opts: { expiresInSec: number; contentLength?: number; contentType?: string },
  ): Promise<PresignedRequest> {
    if (opts.contentLength !== undefined) {
      if (!Number.isSafeInteger(opts.contentLength) || opts.contentLength < 0) {
        throw new DomainError('invalid', 'Content length must be a non-negative integer');
      }
    }
    const headers: Record<string, string> = {};
    if (opts.contentType) headers['content-type'] = opts.contentType;
    return this.presign('PUT', key, opts.expiresInSec, opts.contentLength, headers);
  }

  async presignGet(key: string, opts: { expiresInSec: number }): Promise<PresignedRequest> {
    return this.presign('GET', key, opts.expiresInSec, undefined, {});
  }

  /**
   * Checks a request to `/api/blob/<key>` against its signature. For the route built in the API
   * bucket: `blobKey` is the path after `/api/blob/`, percent-decoded once.
   */
  async verifyPresigned(req: {
    method: string;
    blobKey: string;
    query: URLSearchParams;
    contentLength?: number | null;
    now?: Date;
  }): Promise<VerifyResult> {
    try {
      keySegments(req.blobKey);
    } catch {
      return { ok: false, reason: 'malformed' };
    }
    return verifyBlobUrl(await this.key(), req);
  }

  async healthCheck(): Promise<HealthResult> {
    const started = Date.now();
    const probe = join(this.root, `.health-${randomBytes(6).toString('hex')}`);
    try {
      await mkdir(this.root, { recursive: true, mode: DIR_MODE });
      const fh = await open(probe, 'wx', FILE_MODE);
      await fh.close();
      await unlink(probe);
      return { ok: true, message: 'writable', latencyMs: Date.now() - started };
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      const message =
        code === 'EACCES' || code === 'EPERM'
          ? 'permission denied'
          : code === 'EROFS'
            ? 'read-only filesystem'
            : code === 'ENOSPC'
              ? 'disk full'
              : 'not writable';
      return { ok: false, message, latencyMs: Date.now() - started };
    }
  }

  private async presign(
    method: BlobMethod,
    key: string,
    expiresInSec: number,
    len: number | undefined,
    headers: Record<string, string>,
  ): Promise<PresignedRequest> {
    keySegments(key);
    if (!Number.isInteger(expiresInSec) || expiresInSec <= 0 || expiresInSec > MAX_EXPIRES_SEC) {
      throw new DomainError('invalid', 'Presign expiry is out of range');
    }
    const expiresAt = new Date(Date.now() + expiresInSec * 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000);
    const url = await buildSignedBlobUrl(this.baseUrl, await this.key(), {
      method,
      key,
      exp,
      ...(len !== undefined ? { len } : {}),
    });
    return { url, method, headers, expiresAt: new Date(exp * 1000) };
  }

  private key(): Promise<CryptoKey> {
    if (!this.signingKey) {
      this.signingKey = (this.secret ? Promise.resolve(this.secret) : this.loadOrCreateSecret())
        .then(importSigningKey)
        .catch((e) => {
          this.signingKey = null;
          throw e;
        });
    }
    return this.signingKey;
  }

  private async loadOrCreateSecret(): Promise<Uint8Array> {
    const file = join(this.root, SIGNING_KEY_FILE);
    try {
      const existing = new Uint8Array(await readFile(file));
      if (existing.length >= 32) return existing;
    } catch (e) {
      if (!isErrno(e, 'ENOENT')) throw e;
    }
    await mkdir(this.root, { recursive: true, mode: DIR_MODE });
    const secret = new Uint8Array(randomBytes(32));
    const tmp = join(this.root, `.tmp-${randomBytes(12).toString('hex')}`);
    const fh = await open(tmp, 'wx', FILE_MODE);
    await fh.writeFile(secret);
    await fh.sync();
    await fh.close();
    try {
      // link() fails if another process created the key first; then use theirs.
      await link(tmp, file);
      return secret;
    } catch (e) {
      if (!isErrno(e, 'EEXIST')) throw e;
      return new Uint8Array(await readFile(file));
    } finally {
      await unlink(tmp).catch(() => {});
    }
  }
}
