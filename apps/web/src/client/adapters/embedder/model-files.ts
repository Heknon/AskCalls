import { DomainError } from '@askcalls/domain';
import { type AssetFile, EMBEDDING_MODEL } from '../../assets';

/**
 * Model files for the embedding worker, verified against the SHA-256 pins in assets.ts before
 * anything parses them. Verified bytes persist in Cache Storage under their hash (public
 * weights, no user data), so a new build never reuses stale files and an old one's entries are
 * dropped. Nothing else is fetched: the worker's transformers.js `fetch` is this module.
 */

export const MODEL_CACHE = 'askcalls-models';
/** transformers.js's own cache from before the files were verified here. */
const LEGACY_CACHES = ['transformers-cache'];

export type FileProgress = (file: string, loaded: number, total: number) => void;

const cacheKey = (origin: string, f: AssetFile) =>
  new URL(`/models/sha256/${f.sha256}`, origin).href;

const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

async function matches(bytes: Uint8Array<ArrayBuffer>, f: AssetFile): Promise<boolean> {
  return (
    bytes.byteLength === f.bytes && hex(await crypto.subtle.digest('SHA-256', bytes)) === f.sha256
  );
}

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(MODEL_CACHE);
  } catch {
    return null;
  }
}

async function download(
  url: string,
  f: AssetFile,
  onProgress: FileProgress,
): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok || !res.body) throw new DomainError('provider_error', 'model file not available');
  const out = new Uint8Array(f.bytes);
  let n = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (n + value.byteLength > f.bytes) {
      await reader.cancel();
      throw new DomainError('invalid', 'model file failed verification');
    }
    out.set(value, n);
    n += value.byteLength;
    onProgress(f.path, n, f.bytes);
  }
  return n === f.bytes ? out : out.subarray(0, n);
}

export class ModelFiles {
  readonly #base: string;
  readonly #origin: string;
  readonly #onProgress: FileProgress;
  #pruned = false;
  /** Set once any file failed its hash check (transformers.js swallows fetch errors). */
  verificationFailed = false;

  /** `base`: the build's directory URL (assets.ts `modelDirectoryUrl`). */
  constructor(base: string, origin: string, onProgress: FileProgress) {
    this.#base = base;
    this.#origin = origin;
    this.#onProgress = onProgress;
  }

  /** The pinned file at `path`, from Cache Storage or the model host; refuses any other bytes. */
  async get(path: string): Promise<Uint8Array<ArrayBuffer>> {
    const f = EMBEDDING_MODEL.files.find((x) => x.path === path);
    if (!f) throw new DomainError('not_found', 'not a model file');
    const cache = await openCache();
    await this.#dropStale(cache);
    const key = cacheKey(this.#origin, f);
    const hit = await cache?.match(key).catch(() => undefined);
    if (hit) {
      const bytes = new Uint8Array(await hit.arrayBuffer());
      if (await matches(bytes, f)) {
        this.#onProgress(f.path, f.bytes, f.bytes);
        return bytes;
      }
      await cache?.delete(key);
    }
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = await download(new URL(f.path, this.#base).href, f, this.#onProgress);
      if (!(await matches(bytes, f))) {
        throw new DomainError('invalid', 'model file failed verification');
      }
    } catch (e) {
      if (e instanceof DomainError && e.code === 'invalid') this.verificationFailed = true;
      throw e;
    }
    await cache?.put(key, new Response(bytes)).catch(() => {});
    return bytes;
  }

  async #dropStale(cache: Cache | null) {
    if (this.#pruned || !cache) return;
    this.#pruned = true;
    const pinned = new Set(EMBEDDING_MODEL.files.map((f) => cacheKey(this.#origin, f)));
    try {
      for (const req of await cache.keys()) if (!pinned.has(req.url)) await cache.delete(req);
      for (const name of LEGACY_CACHES) await caches.delete(name);
    } catch {}
  }

  /**
   * A `fetch` for transformers.js: files under `prefix` (a path on this origin) are served
   * from `get`, anything else is a 404, so the library cannot reach the network on its own.
   */
  fetchFor(prefix: string): (input: string | URL) => Promise<Response> {
    const root = new URL(prefix, this.#origin).href;
    return async (input) => {
      const url = new URL(String(input), this.#origin).href;
      const path = url.startsWith(root) ? url.slice(root.length) : null;
      if (path === null || !EMBEDDING_MODEL.files.some((f) => f.path === path)) {
        return new Response(null, { status: 404 });
      }
      const bytes = await this.get(path);
      return new Response(bytes, { headers: { 'Content-Length': String(bytes.byteLength) } });
    };
  }
}
