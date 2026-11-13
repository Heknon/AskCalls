import type { Manifest } from '@askcalls/client-core/bulk/manifest';
import { type FileRef, type Pairing, pairFiles } from '@askcalls/client-core/bulk/pairing';
import {
  type BulkCounts,
  type BulkItemState,
  BulkQueue,
  type BulkState,
  isTerminal,
  planBatch,
} from '@askcalls/client-core/bulk/queue';
import {
  createBulkRunner,
  itemMeta,
  loadManifest,
  type PreflightSummary,
  preflight,
} from '@askcalls/client-core/bulk/runner';
import type { ActiveStatus, IngestMeta } from '@askcalls/client-core/ingest';
import { isDomainError } from '@askcalls/domain';
import type { BrowserClient } from '../../../../../../client/browser-client';
import { remainingSeconds } from './plan';
import { pendingSources, remapRefs } from './refs';

export type BulkError = 'emptyFolder' | 'zipError' | 'manifestError' | 'pickFailed';

export interface Plan {
  pairing: Pairing;
  summary: PreflightSummary;
  /** Items a manifest row describes. */
  manifestCovered: number;
}

export interface QueueView {
  items: readonly BulkItemState[];
  counts: BulkCounts;
  paused: boolean;
  /** Restored after a reload and not resumed yet. */
  restored: boolean;
  /** Files the rest of the batch needs: lost with the page, or the folder needs access again. */
  missing: 'files' | 'access' | null;
  etaSec: number | null;
  meta: ReadonlyMap<string, IngestMeta>;
  /** The step each failed item was at, for this page only. */
  lastStep: ReadonlyMap<string, ActiveStatus>;
}

export type BulkSnapshot =
  | { phase: 'loading' }
  | { phase: 'empty'; error: BulkError | null }
  | { phase: 'planning' }
  | { phase: 'preflight'; plan: Plan; error: BulkError | null }
  | { phase: 'queue'; queue: QueueView };

const utcOffsetMinutes = () => -new Date().getTimezoneOffset();

/** WAV durations from the header; other formats fall back to the size estimate. */
async function wavSeconds(client: BrowserClient, file: FileRef): Promise<number | null> {
  if (!file.name.toLowerCase().endsWith('.wav')) return null;
  try {
    const src = await client.bulkFiles.audio(file);
    const head =
      src instanceof Blob
        ? new Uint8Array(await src.slice(0, 44).arrayBuffer())
        : 'bytes' in src
          ? src.bytes.subarray(0, 44)
          : null;
    if (!head || head.length < 44) return null;
    const byteRate = new DataView(head.buffer, head.byteOffset, 44).getUint32(28, true);
    return byteRate > 0 ? Math.max(0, file.size - 44) / byteRate : null;
  } catch {
    return null;
  }
}

/**
 * The bulk import of one unlocked session (spec 8), kept outside React so it keeps running while
 * the user looks at other screens. Holds file references and statuses only; content is read
 * when an item runs. Dropped on lock: the persisted queue resumes after the next unlock.
 */
export class BulkController {
  #snapshot: BulkSnapshot = { phase: 'loading' };
  #listeners = new Set<() => void>();
  #refs: FileRef[] = [];
  #manifestRef: FileRef | null = null;
  #queue: BulkQueue | null = null;
  #manifest: Manifest | null = null;
  #meta = new Map<string, IngestMeta>();
  #lastStep = new Map<string, ActiveStatus>();
  #restored = false;
  #missing: QueueView['missing'] = null;
  #started = 0;
  #finished = 0;
  #emitTimer: ReturnType<typeof setTimeout> | null = null;
  #unsubscribe: (() => void) | null = null;
  #disposed = false;
  #planRun = 0;

  constructor(
    private readonly client: BrowserClient,
    private readonly onProgress: () => void,
  ) {
    void this.#init();
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getSnapshot = () => this.#snapshot;

  dispose() {
    this.#disposed = true;
    this.#queue?.pause();
    this.#unsubscribe?.();
    this.#listeners.clear();
    if (this.#emitTimer) clearTimeout(this.#emitTimer);
  }

  #set(s: BulkSnapshot) {
    if (this.#disposed) return;
    this.#snapshot = s;
    for (const l of this.#listeners) l();
  }

  /** Status changes arrive in bursts; the table re-renders at most every 100 ms. */
  #emitQueue() {
    if (this.#emitTimer) return;
    this.#emitTimer = setTimeout(() => {
      this.#emitTimer = null;
      this.#publishQueue();
    }, 100);
  }

  #publishQueue() {
    const q = this.#queue;
    if (!q) return;
    const counts = q.counts();
    const remaining = counts.queued + counts.active;
    const elapsed = this.#started ? Date.now() - this.#started : 0;
    const etaSec = q.paused ? null : remainingSeconds(this.#finished, elapsed, remaining);
    this.#set({
      phase: 'queue',
      queue: {
        items: q.items.map((i) => ({ ...i })),
        counts,
        paused: q.paused,
        restored: this.#restored,
        missing: this.#missing,
        etaSec,
        meta: this.#meta,
        lastStep: this.#lastStep,
      },
    });
  }

  async #init() {
    try {
      const state = await this.client.bulkState.load();
      if (!state || state.items.length === 0) return this.#set({ phase: 'empty', error: null });
      this.#restored = state.items.some((i) => !isTerminal(i.status));
      this.#missing = this.#restored ? await this.#checkSources(state) : null;
      await this.#open(state);
    } catch {
      this.#set({ phase: 'empty', error: null });
    }
  }

  /** Whether the files the rest of a batch needs can be read now. */
  async #checkSources(state: BulkState): Promise<QueueView['missing']> {
    let missing: QueueView['missing'] = null;
    for (const ref of pendingSources(state).values()) {
      try {
        await this.client.bulkFiles.audio(ref);
      } catch (e) {
        if (isDomainError(e) && e.code === 'forbidden') missing ??= 'access';
        else return 'files';
      }
    }
    return missing;
  }

  async #open(state: BulkState, opts: { create?: boolean } = {}) {
    const { ctx } = this.client;
    const settings = await ctx.userData.get('settings');
    const reader = this.client.bulkFiles;
    this.#manifest =
      this.#missing === 'files'
        ? null
        : await loadManifest(reader, state.manifest).catch(() => null);
    const run = createBulkRunner(ctx, {
      reader,
      manifest: this.#manifest,
      backupRecordings: state.backupRecordings,
      region: settings.phoneRegion,
      utcOffsetMinutes: utcOffsetMinutes(),
    });
    const options = { store: this.client.bulkState, run };
    const queue = opts.create
      ? await BulkQueue.create(state, options)
      : await BulkQueue.restore(options);
    if (!queue) return this.#set({ phase: 'empty', error: null });
    this.#unsubscribe?.();
    this.#queue = queue;
    this.#meta = new Map();
    for (const item of queue.items) {
      this.#meta.set(
        item.id,
        itemMeta(item, {
          manifest: this.#manifest,
          region: settings.phoneRegion,
          utcOffsetMinutes: utcOffsetMinutes(),
        }),
      );
    }
    this.#unsubscribe = queue.subscribe((item) => {
      if (!isTerminal(item.status) && item.status !== 'queued') {
        this.#lastStep.set(item.id, item.status as ActiveStatus);
      } else if (isTerminal(item.status)) {
        this.#finished++;
        this.onProgress();
      }
      this.#emitQueue();
    });
    this.#publishQueue();
  }

  // Picking

  async addFiles(files: readonly File[]) {
    const bulk = this.client.bulkFiles;
    const plain: File[] = [];
    let zipFailed = false;
    for (const f of files) {
      const lower = f.name.toLowerCase();
      if (lower.endsWith('.zip')) {
        try {
          this.#refs.push(...(await bulk.addZip(f)));
        } catch {
          zipFailed = true;
        }
      } else if (lower.endsWith('.csv') && files.length === 1) {
        this.#manifestRef = bulk.addFiles([f])[0]!;
      } else plain.push(f);
    }
    this.#refs.push(...bulk.addFiles(plain));
    await this.#plan(zipFailed ? 'zipError' : null);
  }

  async pickFolder() {
    try {
      this.#refs.push(...(await this.client.bulkFiles.pickDirectory()));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      return this.#set({ phase: 'empty', error: 'pickFailed' });
    }
    await this.#plan(null);
  }

  async addManifest(file: File) {
    this.#manifestRef = this.client.bulkFiles.addFiles([file])[0]!;
    await this.#plan(null);
  }

  reset() {
    this.#refs = [];
    this.#manifestRef = null;
    this.#set({ phase: 'empty', error: null });
  }

  async #plan(error: BulkError | null) {
    const run = ++this.#planRun;
    const pairing = pairFiles(this.#refs);
    if (this.#manifestRef) pairing.manifest = this.#manifestRef;
    if (pairing.items.length === 0) {
      return this.#set({
        phase: 'empty',
        error: error ?? (this.#refs.length || this.#manifestRef ? 'emptyFolder' : null),
      });
    }
    this.#set({ phase: 'planning' });
    const { ctx, bulkFiles } = this.client;
    let manifest: Manifest | null = null;
    let manifestError = false;
    try {
      manifest = await loadManifest(bulkFiles, pairing.manifest);
    } catch {
      manifestError = true;
    }
    const summary = await preflight(ctx, pairing, {
      reader: bulkFiles,
      estimateDurationSec: (f) => wavSeconds(this.client, f),
    });
    if (run !== this.#planRun) return;
    const manifestCovered = manifest
      ? pairing.items.filter((i) =>
          [i.audio, i.transcript].some((f) => f && manifest.lookup(f.name)),
        ).length
      : 0;
    this.#set({
      phase: 'preflight',
      plan: { pairing, summary, manifestCovered },
      error: error ?? (manifestError ? 'manifestError' : null),
    });
  }

  // The queue

  async start(backupRecordings: boolean) {
    const s = this.#snapshot;
    if (s.phase !== 'preflight') return;
    const state = planBatch(s.plan.pairing, { backupRecordings });
    this.#restored = false;
    this.#missing = null;
    this.#lastStep.clear();
    await this.#open(state, { create: true });
    this.#run();
  }

  #run() {
    this.#started = Date.now();
    this.#finished = 0;
    this.#queue?.start();
    this.#publishQueue();
  }

  pause() {
    this.#queue?.pause();
    this.#publishQueue();
  }

  /** Resume (also after a reload). Asking for folder access needs this click. */
  async resume() {
    const q = this.#queue;
    if (!q) return;
    if (this.#missing === 'access') {
      const dirs = await this.client.bulkFiles.storedDirectories();
      for (const d of dirs) {
        if (d.permission !== 'granted') await this.client.bulkFiles.requestAccess(d.id);
      }
      const state = await this.client.bulkState.load();
      this.#missing = state ? await this.#checkSources(state) : null;
      if (this.#missing) return this.#publishQueue();
      if (!this.#manifest && state?.manifest) {
        await this.#open(state);
      }
    }
    if (this.#missing) return this.#publishQueue();
    this.#restored = false;
    this.#run();
  }

  /** The files of a restored batch, picked again: by folder or by files. */
  async reattach(source: { files: readonly File[] } | 'folder') {
    const bulk = this.client.bulkFiles;
    let refs: FileRef[] = [];
    try {
      if (source === 'folder') refs = await bulk.pickDirectory();
      else {
        for (const f of source.files) {
          if (f.name.toLowerCase().endsWith('.zip')) refs.push(...(await bulk.addZip(f)));
        }
        refs.push(
          ...bulk.addFiles(source.files.filter((f) => !f.name.toLowerCase().endsWith('.zip'))),
        );
      }
    } catch {
      return;
    }
    const state = await this.client.bulkState.load();
    if (!state) return;
    const { state: next } = remapRefs(state, refs);
    await this.client.bulkState.save(next);
    this.#missing = await this.#checkSources(next);
    await this.#open(next);
  }

  retry(id?: string) {
    const q = this.#queue;
    if (!q) return;
    if (this.#restored && !this.#missing) this.#restored = false;
    q.retry(id ? [id] : undefined);
    if (!this.#started) this.#started = Date.now();
    this.#publishQueue();
  }

  /** After a finished batch: forget it and its files. */
  async clear() {
    await this.#queue?.clear();
    this.#unsubscribe?.();
    this.#queue = null;
    await this.client.bulkFiles.forgetAll().catch(() => {});
    this.reset();
  }
}

const controllers = new WeakMap<BrowserClient, BulkController>();

/** One controller per unlocked session of a browser client. */
export function bulkController(client: BrowserClient, onProgress: () => void): BulkController {
  let c = controllers.get(client);
  if (!c) {
    const created = new BulkController(client, onProgress);
    c = created;
    controllers.set(client, created);
    const off = client.session.onWipe(() => {
      off();
      created.dispose();
      controllers.delete(client);
    });
  }
  return c;
}
