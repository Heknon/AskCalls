import type { FailureReason } from '../errors';
import type { IngestGates, IngestOptions, IngestResult, IngestStatus, MetaEdits } from '../ingest';
import type { FileRef, Pairing } from './pairing';

export const BULK_STATE_VERSION = 1;

/** Spec 8: 2 transcriptions and 4 local indexing jobs at a time. */
export const DEFAULT_CONCURRENCY = { transcription: 2, indexing: 4 } as const;

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
  /** Corrections made before the import started; they win over file names and the manifest. */
  edits?: MetaEdits;
  /** The user listened and chose to keep it as a call with no transcript. */
  empty?: boolean;
}

export interface BulkState {
  v: typeof BULK_STATE_VERSION;
  manifest: FileRef | null;
  backupRecordings: boolean;
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
  concurrency?: { transcription: number; indexing: number };
}

export type BulkRunner = (
  item: Readonly<BulkItemState>,
  opts: IngestOptions,
) => Promise<IngestResult>;

const TERMINAL: readonly IngestStatus[] = ['done', 'duplicate', 'failed'];
export const isTerminal = (s: IngestStatus) => TERMINAL.includes(s);

export function planBatch(
  pairing: Pairing,
  opts: { backupRecordings?: boolean; edits?: ReadonlyMap<string, MetaEdits> } = {},
): BulkState {
  return {
    v: BULK_STATE_VERSION,
    manifest: pairing.manifest,
    backupRecordings: opts.backupRecordings ?? false,
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

/** A counting semaphore. */
export class Semaphore {
  #free: number;
  #waiting: Array<() => void> = [];

  constructor(readonly size: number) {
    this.#free = size;
  }

  get available(): number {
    return this.#free;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#free > 0) this.#free--;
    else await new Promise<void>((resolve) => this.#waiting.push(resolve));
    try {
      return await fn();
    } finally {
      const next = this.#waiting.shift();
      if (next) next();
      else this.#free++;
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
    this.#gates = {
      transcription: (fn) => transcription.run(fn),
      indexing: (fn) => indexing.run(fn),
    };
    this.#maxActive = c.transcription + c.indexing;
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
    while (!this.#state.paused && this.#running.size < this.#maxActive) {
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
    if (result.status === 'done') {
      this.#update(item, { status: 'done', callId: result.callId, reason: null });
    } else if (result.status === 'duplicate') {
      this.#update(item, { status: 'duplicate', existingId: result.existingId, reason: null });
    } else {
      this.#update(item, { status: 'failed', reason: result.reason });
    }
    this.#running.delete(item.id);
    this.#pump();
  }
}
