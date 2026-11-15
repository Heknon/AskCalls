import type { Embedder } from '@askcalls/client-core/ports/index';
import { DomainError } from '@askcalls/domain';
import { EMBEDDING_MODEL, EMBEDDING_MODEL_ID, modelDirectoryUrl } from '../../assets';
import type { EmbedderDevice, EmbedderEvent, EmbedderRequest } from './protocol';

export interface ModelLoadProgress {
  /** Bytes fetched so far across model files (from cache or network). */
  loaded: number;
  /** Total bytes of the model files (known up front from their pins). */
  total: number;
  files: Record<string, { loaded: number; total: number }>;
}

export type EmbedderStatus =
  | { state: 'idle' }
  | { state: 'loading'; progress: ModelLoadProgress }
  | { state: 'ready'; device: EmbedderDevice; loadMs: number }
  /** `verification`: a downloaded file did not match its pinned hash and was refused. */
  | { state: 'failed'; reason: 'verification' | 'other' };

export interface WorkerEmbedderOptions {
  /**
   * Texts per inference call. Default 1: the q8 model quantizes activations per batch, so with
   * larger batches a vector depends on its neighbours and no longer matches the agent's.
   */
  batchSize?: number;
  /**
   * Default `wasm`. The model is int8 (q8), which WebGPU runs poorly: on a software adapter
   * start-up took 47 s against 1 s and indexing a call 4 s against 0.4 s, and on a phone a
   * search took minutes. `auto` tries WebGPU first and falls back to WebAssembly when it hangs.
   */
  prefer?: EmbedderDevice | 'auto';
  /**
   * The instance's model host (`EMBEDDING_MODEL_URL`, from the page's runtime config); null or
   * absent: this origin's /models/.
   */
  modelBaseUrl?: string | null;
  createWorker?: () => Worker;
  /**
   * A load with no word from the worker for this long has stalled, and so has an embed that
   * takes a third of it plus 2 s per text. Default 45 s.
   */
  stallMs?: number;
}

interface Pending {
  count: number;
  resolve: (v: Float32Array[]) => void;
  reject: (e: unknown) => void;
  cleanup: () => void;
}

const DIMS = EMBEDDING_MODEL.dimensions;

const TOTAL_BYTES = EMBEDDING_MODEL.files.reduce((n, f) => n + f.bytes, 0);
const STALL_MS = 45_000;
/** An embed may take a third of `stallMs` plus this per text before it counts as hung. */
const PER_TEXT_MS = 2_000;

/**
 * The browser Embedder (spec 3.3): transformers.js and ONNX Runtime in a dedicated worker,
 * on WebAssembly (see `prefer`). Nothing is downloaded until the
 * first `embed()` or `load()` (ingest, semantic search); keyword search and reading calls never
 * start it. `status` and `onStatus` report the first-load download progress for the UI.
 */
export class WorkerEmbedder implements Embedder {
  readonly modelId = EMBEDDING_MODEL_ID;
  readonly dimensions = 384 as const;
  readonly minSimilarity = EMBEDDING_MODEL.minSimilarity;
  #worker: Worker | null = null;
  #next = 1;
  #pending = new Map<number, Pending>();
  #status: EmbedderStatus = { state: 'idle' };
  #listeners = new Set<(s: EmbedderStatus) => void>();
  #ready: Promise<EmbedderDevice> | null = null;
  #readyResolve: ((d: EmbedderDevice) => void) | null = null;
  #readyReject: ((e: unknown) => void) | null = null;
  readonly #batchSize: number;
  #prefer: EmbedderDevice | 'auto';
  readonly #stallMs: number;
  #stall: ReturnType<typeof setTimeout> | null = null;
  /** The embed the running timer is for; null while it times the load. */
  #timing: number | null = null;
  readonly #modelBaseUrl: string | null;
  readonly #createWorker: () => Worker;

  constructor(opts: WorkerEmbedderOptions = {}) {
    this.#batchSize = opts.batchSize ?? 1;
    this.#prefer = opts.prefer ?? 'wasm';
    this.#stallMs = opts.stallMs ?? STALL_MS;
    this.#modelBaseUrl = opts.modelBaseUrl ?? null;
    this.#createWorker =
      opts.createWorker ??
      (() =>
        new Worker(new URL('./embedder.worker.ts', import.meta.url), {
          type: 'module',
          name: 'askcalls-embedder',
        }));
  }

  get status(): EmbedderStatus {
    return this.#status;
  }

  onStatus(listener: (s: EmbedderStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Starts the model download and session; resolves with the device in use. */
  load(): Promise<EmbedderDevice> {
    this.#ensure();
    return this.#ready!;
  }

  async embed(
    texts: string[],
    opts: { signal?: AbortSignal; urgent?: boolean } = {},
  ): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    opts.signal?.throwIfAborted();
    const worker = this.#ensure();
    const id = this.#next++;
    return new Promise<Float32Array[]>((resolve, reject) => {
      const onAbort = () => {
        worker.postMessage({ type: 'cancel', id } satisfies EmbedderRequest);
        this.#settle(id)?.reject(opts.signal!.reason ?? new DOMException('aborted', 'AbortError'));
      };
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      this.#pending.set(id, {
        count: texts.length,
        resolve,
        reject,
        cleanup: () => opts.signal?.removeEventListener('abort', onAbort),
      });
      worker.postMessage({
        type: 'embed',
        id,
        texts,
        batchSize: this.#batchSize,
        ...(opts.urgent && { urgent: true }),
      } satisfies EmbedderRequest);
      if (!this.#stall) this.#watch();
    });
  }

  /** Stops the worker and frees the model; the next call starts it again. */
  dispose(): void {
    this.#watch('off');
    this.#worker?.terminate();
    this.#worker = null;
    for (const id of [...this.#pending.keys()]) {
      this.#settle(id)?.reject(new DomainError('unsupported', 'embedder stopped'));
    }
    this.#readyReject?.(new DomainError('unsupported', 'embedder stopped'));
    this.#ready?.catch(() => {});
    this.#ready = null;
    this.#setStatus({ state: 'idle' });
  }

  #settle(id: number): Pending | undefined {
    const p = this.#pending.get(id);
    if (!p) return undefined;
    this.#pending.delete(id);
    p.cleanup();
    if (id === this.#timing) this.#watch();
    return p;
  }

  /**
   * Nothing may wait on the worker forever. While the model loads, every message restarts the
   * clock; once it is ready, the oldest embed (the worker runs them in order) gets a budget by
   * its size. Silence means a download stopped or a backend hung (WebGPU can):
   * fail what waits, so search shows what it has, and start the next try on WebAssembly.
   */
  #watch(mode: 'off' | 'auto' | 'downloaded' = 'auto') {
    if (this.#stall) clearTimeout(this.#stall);
    this.#stall = null;
    this.#timing = null;
    if (mode === 'off' || !this.#worker) return;
    const status = this.#status;
    let ms = this.#stallMs;
    let toWasm = mode === 'downloaded';
    if (status.state === 'ready') {
      const head = this.#pending.entries().next().value;
      if (!head) return;
      this.#timing = head[0];
      ms = Math.round(ms / 3) + head[1].count * PER_TEXT_MS;
      toWasm = status.device === 'webgpu';
    }
    this.#stall = setTimeout(() => {
      if (toWasm && this.#prefer === 'auto') this.#prefer = 'wasm';
      this.dispose();
      this.#setStatus({ state: 'failed', reason: 'other' });
    }, ms);
  }

  #setStatus(s: EmbedderStatus) {
    this.#status = s;
    for (const l of this.#listeners) l(s);
  }

  #ensure(): Worker {
    if (this.#worker) return this.#worker;
    const worker = this.#createWorker();
    this.#worker = worker;
    this.#ready = new Promise<EmbedderDevice>((resolve, reject) => {
      this.#readyResolve = resolve;
      this.#readyReject = reject;
    });
    this.#ready.catch(() => {});
    const progress: ModelLoadProgress = { loaded: 0, total: TOTAL_BYTES, files: {} };
    this.#setStatus({ state: 'loading', progress: { ...progress } });
    this.#watch();
    worker.onmessage = ({ data }: MessageEvent<EmbedderEvent>) => {
      switch (data.type) {
        case 'progress': {
          progress.files[data.file] = { loaded: data.loaded, total: data.total };
          const all = Object.values(progress.files);
          progress.loaded = all.reduce((n, f) => n + f.loaded, 0);
          if (this.#timing === null) {
            this.#watch(progress.loaded >= progress.total ? 'downloaded' : 'auto');
          }
          this.#setStatus({
            state: 'loading',
            progress: { ...progress, files: { ...progress.files } },
          });
          break;
        }
        case 'ready':
          this.#setStatus({ state: 'ready', device: data.device, loadMs: data.loadMs });
          this.#watch();
          this.#readyResolve?.(data.device);
          break;
        case 'load_failed':
          this.#watch('off');
          this.#setStatus({ state: 'failed', reason: data.reason });
          this.#readyReject?.(
            data.reason === 'verification'
              ? new DomainError('invalid', 'embedding model failed verification')
              : new DomainError('unsupported', 'embedding model failed to load'),
          );
          break;
        case 'result': {
          const vectors = Array.from({ length: data.count }, (_, i) =>
            data.vectors.subarray(i * DIMS, (i + 1) * DIMS),
          );
          this.#settle(data.id)?.resolve(vectors);
          break;
        }
        case 'failed':
          this.#settle(data.id)?.reject(
            data.cancelled
              ? new DOMException('aborted', 'AbortError')
              : new DomainError('provider_error', 'embedding failed', { embedder: data.failure }),
          );
          break;
      }
    };
    worker.onerror = () => {
      this.dispose();
      this.#setStatus({ state: 'failed', reason: 'other' });
    };
    worker.postMessage({
      type: 'load',
      prefer: this.#prefer,
      modelUrl: modelDirectoryUrl(this.#modelBaseUrl, globalThis.location.origin),
    } satisfies EmbedderRequest);
    return worker;
  }
}
