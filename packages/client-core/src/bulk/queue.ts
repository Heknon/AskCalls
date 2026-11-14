import type { FailureReason } from '../errors';
import type { IngestGates, IngestOptions, IngestResult, IngestStatus, MetaEdits } from '../ingest';
import type { FileRef, Pairing } from './pairing';

export const BULK_STATE_VERSION = 1;

export interface Concurrency {
  /** Transcriptions at a time (provider round trips); halves when rate limited, then recovers. */
  transcription: number;
  /** Local indexing jobs (embedding, encryption, upload). */
  indexing: number;
  /** Audio decodes at a time (CPU and memory); defaults to `indexing`. */
  decoding?: number;
  /** Translations at a time (LLM round trips); defaults to `transcription`. */
  translation?: number;
  /**
   * Files in progress at once. Each holds its decoded audio until it is stored, so this is what
   * bounds memory. Defaults to transcriptions + 2.
   */
  inFlight?: number;
}

/** Spec 8, for a device with about 8 GB of memory or more (`concurrencyFor`). */
export const DEFAULT_CONCURRENCY: Required<Concurrency> = {
  transcription: 6,
  indexing: 4,
  decoding: 2,
  translation: 4,
  inFlight: 8,
};

/**
 * Limits for this device: `memoryGb` is `navigator.deviceMemory` (Chromium rounds it, at most 8)
 * and `cores` `navigator.hardwareConcurrency`. Unknown values count as a modest phone.
 */
export function concurrencyFor(memoryGb?: number, cores?: number): Required<Concurrency> {
  const mem = memoryGb ?? 4;
  const cpu = cores ?? 4;
  if (mem >= 8) return { ...DEFAULT_CONCURRENCY, decoding: cpu >= 8 ? 3 : 2 };
  if (mem >= 4) {
    return { transcription: 4, indexing: 2, decoding: 2, translation: 3, inFlight: 5 };
  }
  return { transcription: 2, indexing: 1, decoding: 1, translation: 2, inFlight: 3 };
}

/** Rate-limited retries before an item fails with `rate_limited`. */
const MAX_RATE_LIMITED = 6;
/** Done items in a row before a halved transcription limit grows by one again. */
const RECOVER_AFTER = 8;

/** What the queue persists per file: references and status only, never content. */
export interface BulkItemState {
  id: string;
  name: string;
  audio: FileRef | null;
  transcript: FileRef | null;
  status: IngestStatus;
  reason: FailureReason | null;
  callId: string | null;
  existingId: string | null;
  attempts: number;
  /** Times the provider or the server said "too many requests" for this item. */
  rateLimited?: number;
  /** Corrections made before the import started; they win over file names and the manifest. */
  edits?: MetaEdits;
  /** The user listened and chose to keep it as a call with no transcript. */
  empty?: boolean;
}

export interface BulkState {
  v: typeof BULK_STATE_VERSION;
  manifest: FileRef | null;
  backupRecordings: boolean;
  /** IANA zone file names and the manifest were read in. Absent on batches saved before it. */
  timeZone?: string;
  paused: boolean;
  items: BulkItemState[];
}

/** IndexedDB in the browser, a local JSON file for the agent. */
export interface BulkStateStore {
  load(): Promise<BulkState | null>;
  save(state: BulkState): Promise<void>;
  clear(): Promise<void>;
}

export interface BulkQueueOptions {
  store: BulkStateStore;
  run: BulkRunner;
  concurrency?: Concurrency;
  /** Wait before a rate-limited item is retried, by how many times it was. */
  backoffMs?: (times: number) => number;
}

const defaultBackoff = (times: number) => Math.min(60_000, 2_000 * 2 ** (times - 1));

export type BulkRunner = (
  item: Readonly<BulkItemState>,
  opts: IngestOptions,
) => Promise<IngestResult>;

const TERMINAL: readonly IngestStatus[] = ['done', 'duplicate', 'failed'];
export const isTerminal = (s: IngestStatus) => TERMINAL.includes(s);

export function planBatch(
  pairing: Pairing,
  opts: {
    backupRecordings?: boolean;
    edits?: ReadonlyMap<string, MetaEdits>;
    timeZone?: string;
  } = {},
): BulkState {
  return {
    v: BULK_STATE_VERSION,
    manifest: pairing.manifest,
    backupRecordings: opts.backupRecordings ?? false,
    ...(opts.timeZone && { timeZone: opts.timeZone }),
    paused: false,
    items: pairing.items.map((p) => ({
      id: p.key,
      name: p.name,
      audio: p.audio,
      transcript: p.transcript,
      status: 'queued',
      reason: null,
      callId: null,
      existingId: null,
      attempts: 0,
      ...(opts.edits?.get(p.key) && { edits: opts.edits.get(p.key) }),
    })),
  };
}

/** A counting semaphore whose size can change while it is in use. */
export class Semaphore {
  #size: number;
  #held = 0;
  #waiting: Array<() => void> = [];

  constructor(size: number) {
    this.#size = size;
  }

  get size(): number {
    return this.#size;
  }

  get available(): number {
    return Math.max(0, this.#size - this.#held);
  }

  /** A smaller size takes effect as holders finish; a larger one admits waiters now. */
  resize(size: number): void {
    this.#size = Math.max(1, size);
    this.#admit();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#held < this.#size) this.#held++;
    else await new Promise<void>((resolve) => this.#waiting.push(resolve));
    try {
      return await fn();
    } finally {
      this.#held--;
      this.#admit();
    }
  }

  #admit(): void {
    while (this.#held < this.#size && this.#waiting.length) {
      this.#held++;
      this.#waiting.shift()!();
    }
  }
}

export interface BulkCounts {
  total: number;
  queued: number;
  active: number;
  done: number;
  duplicate: number;
  failed: number;
}

/**
 * The bulk upload queue (spec 8). Items move queued → decoding → transcribing → indexing →
 * encrypting → uploading → done / duplicate / failed. Transcription and indexing have separate
 * concurrency limits. Every change is persisted, so a reload resumes: items that were in flight
 * go back to queued. Pause stops starting new items; in-flight items finish.
 */
export class BulkQueue {
  #state: BulkState;
  #store: BulkStateStore;
  #run: BulkRunner;
  #gates: IngestGates;
  #maxActive: number;
  #transcription: Semaphore;
  #transcriptionMax: number;
  #doneInARow = 0;
  #backoffMs: (times: number) => number;
  #cooldown: ReturnType<typeof setTimeout> | null = null;
  #running = new Set<string>();
  #saving: Promise<void> = Promise.resolve();
  #listeners = new Set<(item: Readonly<BulkItemState>) => void>();
  #idle: Array<() => void> = [];

  private constructor(state: BulkState, opts: BulkQueueOptions) {
    this.#state = state;
    this.#store = opts.store;
    this.#run = opts.run;
    const c = opts.concurrency ?? DEFAULT_CONCURRENCY;
    const transcription = new Semaphore(c.transcription);
    const indexing = new Semaphore(c.indexing);
    const decoding = new Semaphore(c.decoding ?? c.indexing);
    const translation = new Semaphore(c.translation ?? c.transcription);
    this.#gates = {
      transcription: (fn) => transcription.run(fn),
      indexing: (fn) => indexing.run(fn),
      decoding: (fn) => decoding.run(fn),
      translation: (fn) => translation.run(fn),
    };
    this.#transcription = transcription;
    this.#transcriptionMax = c.transcription;
    this.#maxActive = c.inFlight ?? c.transcription + 2;
    this.#backoffMs = opts.backoffMs ?? defaultBackoff;
  }

  /** A new batch; persisted before it starts. */
  static async create(state: BulkState, opts: BulkQueueOptions): Promise<BulkQueue> {
    const q = new BulkQueue(structuredClone(state), opts);
    await q.#persist();
    return q;
  }

  /** Resumes a persisted batch after a reload, or null when there is none. */
  static async restore(opts: BulkQueueOptions): Promise<BulkQueue | null> {
    const state = await opts.store.load();
    if (!state || state.v !== BULK_STATE_VERSION) return null;
    for (const item of state.items) {
      if (!isTerminal(item.status)) item.status = 'queued';
    }
    const q = new BulkQueue(state, opts);
    await q.#persist();
    return q;
  }

  get items(): readonly Readonly<BulkItemState>[] {
    return this.#state.items;
  }

  get paused(): boolean {
    return this.#state.paused;
  }

  /** Transcriptions allowed at once now: lower after a rate limit, back up as calls finish. */
  get transcriptionLimit(): number {
    return this.#transcription.size;
  }

  get backupRecordings(): boolean {
    return this.#state.backupRecordings;
  }

  get manifest(): FileRef | null {
    return this.#state.manifest;
  }

  counts(): BulkCounts {
    const c: BulkCounts = { total: 0, queued: 0, active: 0, done: 0, duplicate: 0, failed: 0 };
    for (const i of this.#state.items) {
      c.total++;
      if (i.status === 'queued') c.queued++;
      else if (i.status === 'done' || i.status === 'duplicate' || i.status === 'failed')
        c[i.status]++;
      else c.active++;
    }
    return c;
  }

  subscribe(listener: (item: Readonly<BulkItemState>) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  start(): void {
    this.#state.paused = false;
    void this.#persist();
    this.#pump();
  }

  pause(): void {
    this.#state.paused = true;
    void this.#persist();
  }

  resume(): void {
    this.start();
  }

  /** Requeues failed items (all, or the given ids) and starts them unless paused. */
  retry(ids?: readonly string[]): number {
    let n = 0;
    for (const item of this.#state.items) {
      if (item.status !== 'failed' || (ids && !ids.includes(item.id))) continue;
      item.status = 'queued';
      item.reason = null;
      n++;
      this.#emit(item);
    }
    void this.#persist();
    if (!this.#state.paused) this.#pump();
    return n;
  }

  /**
   * Keeps audio whose transcript came back empty as calls with no transcript (all such items, or
   * the given ids): requeued without transcribing again.
   */
  saveEmpty(ids?: readonly string[]): number {
    let n = 0;
    for (const item of this.#state.items) {
      if (item.status !== 'failed' || item.reason !== 'transcript_empty' || !item.audio) continue;
      if (ids && !ids.includes(item.id)) continue;
      item.empty = true;
      item.status = 'queued';
      item.reason = null;
      n++;
      this.#emit(item);
    }
    void this.#persist();
    if (!this.#state.paused) this.#pump();
    return n;
  }

  /** Resolves when nothing is running and nothing will start (all done, or paused). */
  whenIdle(): Promise<void> {
    if (this.#isIdle()) return this.#saving;
    return new Promise((resolve) => this.#idle.push(resolve));
  }

  async clear(): Promise<void> {
    await this.#saving;
    await this.#store.clear();
  }

  #isIdle(): boolean {
    return this.#running.size === 0 && (this.#state.paused || !this.#nextQueued());
  }

  #nextQueued(): BulkItemState | undefined {
    return this.#state.items.find((i) => i.status === 'queued' && !this.#running.has(i.id));
  }

  #persist(): Promise<void> {
    const snapshot = structuredClone(this.#state);
    this.#saving = this.#saving.then(() => this.#store.save(snapshot));
    return this.#saving;
  }

  #emit(item: BulkItemState): void {
    for (const l of this.#listeners) l(item);
  }

  #update(item: BulkItemState, patch: Partial<BulkItemState>): void {
    Object.assign(item, patch);
    this.#emit(item);
    void this.#persist();
  }

  #pump(): void {
    while (!this.#state.paused && !this.#cooldown && this.#running.size < this.#maxActive) {
      const next = this.#nextQueued();
      if (!next) break;
      this.#running.add(next.id);
      next.attempts++;
      void this.#execute(next);
    }
    if (this.#isIdle()) {
      const waiting = this.#idle.splice(0);
      void this.#saving.then(() => {
        for (const w of waiting) w();
      });
    }
  }

  async #execute(item: BulkItemState): Promise<void> {
    let result: IngestResult;
    try {
      result = await this.#run(item, {
        gates: this.#gates,
        onStatus: (status) => this.#update(item, { status }),
      });
    } catch {
      result = { status: 'failed', reason: 'unknown' };
    }
    if (result.status === 'failed' && result.reason === 'rate_limited') {
      const times = (item.rateLimited ?? 0) + 1;
      if (times < MAX_RATE_LIMITED) {
        this.#doneInARow = 0;
        this.#transcription.resize(Math.floor(this.#transcription.size / 2));
        this.#update(item, { status: 'queued', reason: null, rateLimited: times });
        this.#running.delete(item.id);
        if (this.#cooldown) clearTimeout(this.#cooldown);
        this.#cooldown = setTimeout(() => {
          this.#cooldown = null;
          this.#pump();
        }, this.#backoffMs(times));
        return;
      }
    }
    if (result.status === 'done') {
      this.#update(item, { status: 'done', callId: result.callId, reason: null });
      if (
        ++this.#doneInARow >= RECOVER_AFTER &&
        this.#transcription.size < this.#transcriptionMax
      ) {
        this.#doneInARow = 0;
        this.#transcription.resize(this.#transcription.size + 1);
      }
    } else if (result.status === 'duplicate') {
      this.#update(item, { status: 'duplicate', existingId: result.existingId, reason: null });
    } else {
      this.#update(item, { status: 'failed', reason: result.reason });
    }
    this.#running.delete(item.id);
    this.#pump();
  }
}
