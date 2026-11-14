import { describe, expect, it } from 'vitest';
import type { IngestResult } from '../ingest';
import { MemoryBulkStateStore } from '../testing/fakes';
import type { FileRef } from './pairing';
import { pairFiles } from './pairing';
import {
  type BulkItemState,
  BulkQueue,
  type BulkRunner,
  concurrencyFor,
  DEFAULT_CONCURRENCY,
  planBatch,
  Semaphore,
} from './queue';

const ref = (name: string): FileRef => ({ ref: `h:${name}`, name, size: 10 });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A runner whose items wait until the test releases them, following the real gates. */
function controlledRunner() {
  const pending = new Map<string, ReturnType<typeof deferred<IngestResult>>>();
  let transcribing = 0;
  let maxTranscribing = 0;
  let indexing = 0;
  let maxIndexing = 0;
  const run: BulkRunner = async (item, opts) => {
    const d = deferred<IngestResult>();
    pending.set(item.id, d);
    if (item.audio && !item.transcript) {
      opts.onStatus?.('decoding');
      await opts.gates!.transcription(async () => {
        opts.onStatus?.('transcribing');
        transcribing++;
        maxTranscribing = Math.max(maxTranscribing, transcribing);
        await d.promise.then(() => transcribing--);
      });
    }
    return opts.gates!.indexing(async () => {
      opts.onStatus?.('indexing');
      indexing++;
      maxIndexing = Math.max(maxIndexing, indexing);
      const r = await d.promise;
      indexing--;
      return r;
    });
  };
  return {
    run,
    release(id: string, r: IngestResult) {
      pending.get(id)!.resolve(r);
    },
    get started() {
      return [...pending.keys()];
    },
    get maxTranscribing() {
      return maxTranscribing;
    },
    get maxIndexing() {
      return maxIndexing;
    },
  };
}

const done = (callId: string): IngestResult => ({
  status: 'done',
  callId,
  recording: 'none',
  vocabulary: 'updated',
  translation: 'done',
});

describe('Semaphore', () => {
  it('never runs more than its size at once', async () => {
    const s = new Semaphore(2);
    let active = 0;
    let max = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        s.run(async () => {
          active++;
          max = Math.max(max, active);
          await tick();
          active--;
        }),
      ),
    );
    expect(max).toBe(2);
    expect(s.available).toBe(2);
  });

  it('resizes while in use: smaller as holders finish, larger at once', async () => {
    const s = new Semaphore(3);
    const gates = [deferred<void>(), deferred<void>(), deferred<void>(), deferred<void>()];
    let active = 0;
    const runs = gates.map((g) =>
      s.run(async () => {
        active++;
        await g.promise;
        active--;
      }),
    );
    await tick();
    expect(active).toBe(3);
    s.resize(1);
    gates[0]!.resolve();
    gates[1]!.resolve();
    await tick();
    expect(active).toBe(1);
    s.resize(4);
    await tick();
    expect(active).toBe(2);
    gates[2]!.resolve();
    gates[3]!.resolve();
    await Promise.all(runs);
    expect(s.available).toBe(4);
  });
});

describe('concurrencyFor', () => {
  it('scales with device memory and assumes a modest phone when unknown', () => {
    expect(concurrencyFor(8, 8)).toMatchObject({ transcription: 6, inFlight: 8, decoding: 3 });
    expect(concurrencyFor(8, 4)).toEqual(DEFAULT_CONCURRENCY);
    expect(concurrencyFor(4)).toMatchObject({ transcription: 4, inFlight: 5 });
    expect(concurrencyFor()).toEqual(concurrencyFor(4));
    expect(concurrencyFor(2)).toMatchObject({ transcription: 2, inFlight: 3 });
  });
});

describe('BulkQueue', () => {
  it('limits transcription to 2 and indexing to 4, and records outcomes', async () => {
    const files = Array.from({ length: 6 }, (_, i) => ref(`audio${i}.mp3`));
    const store = new MemoryBulkStateStore();
    const r = controlledRunner();
    const q = await BulkQueue.create(planBatch(pairFiles(files)), {
      store,
      run: r.run,
      concurrency: { transcription: 2, indexing: 4, inFlight: 6 },
    });
    const seen: string[] = [];
    q.subscribe((i) => seen.push(`${i.id}:${i.status}`));
    q.start();
    await tick();
    expect(q.items.filter((i) => i.status === 'transcribing')).toHaveLength(2);
    expect(q.counts()).toMatchObject({ total: 6, active: 6, queued: 0 });

    r.release('audio0', done('c0'));
    r.release('audio1', { status: 'duplicate', existingId: 'c-old', match: 'audio' });
    for (const id of ['audio2', 'audio3', 'audio4', 'audio5']) {
      r.release(id, { status: 'failed', reason: 'transcription_failed' });
    }
    await q.whenIdle();
    expect(r.maxTranscribing).toBe(2);
    expect(r.maxIndexing).toBeLessThanOrEqual(4);
    expect(q.counts()).toMatchObject({ done: 1, duplicate: 1, failed: 4, active: 0 });
    expect(q.items.find((i) => i.id === 'audio0')).toMatchObject({ callId: 'c0', attempts: 1 });
    expect(q.items.find((i) => i.id === 'audio1')).toMatchObject({ existingId: 'c-old' });
    expect(seen).toContain('audio0:transcribing');
    expect(seen).toContain('audio0:done');
    expect(store.state?.items.map((i) => i.status)).toEqual(q.items.map((i) => i.status));
  });

  it('backs off when rate limited: requeues, halves transcription, then fails after six', async () => {
    const store = new MemoryBulkStateStore();
    let limited = 0;
    const run: BulkRunner = async (item, opts) =>
      opts.gates!.transcription(async () =>
        item.id === 'busy' || limited++ < 1
          ? { status: 'failed', reason: 'rate_limited' }
          : done(`call-${item.id}`),
      );
    const waits: number[] = [];
    const q = await BulkQueue.create(planBatch(pairFiles([ref('ok.txt'), ref('busy.txt')])), {
      store,
      run,
      concurrency: { transcription: 4, indexing: 1, inFlight: 1 },
      backoffMs: (times) => {
        waits.push(times);
        return 1;
      },
    });
    q.start();
    await q.whenIdle();
    const byId = Object.fromEntries(q.items.map((i) => [i.id, i]));
    expect(byId.ok).toMatchObject({ status: 'done', rateLimited: 1, attempts: 2 });
    expect(byId.busy).toMatchObject({ status: 'failed', reason: 'rate_limited', rateLimited: 5 });
    expect(byId.busy!.attempts).toBe(6);
    expect([...waits].sort()).toEqual([1, 1, 2, 3, 4, 5]);
  });

  it('grows the transcription limit back after calls succeed again', async () => {
    let first = true;
    const run: BulkRunner = async (item) => {
      if (first) {
        first = false;
        return { status: 'failed', reason: 'rate_limited' };
      }
      return done(`call-${item.id}`);
    };
    const files = Array.from({ length: 18 }, (_, i) => ref(`c${String(i).padStart(2, '0')}.txt`));
    const q = await BulkQueue.create(planBatch(pairFiles(files)), {
      store: new MemoryBulkStateStore(),
      run,
      concurrency: { transcription: 4, indexing: 1, inFlight: 1 },
      backoffMs: () => 1,
    });
    q.start();
    await q.whenIdle();
    expect(q.counts()).toMatchObject({ done: 18 });
    expect(q.transcriptionLimit).toBe(4);
  });

  it('pauses, resumes, retries failed items and persists only references and status', async () => {
    const store = new MemoryBulkStateStore();
    let calls = 0;
    const run: BulkRunner = async (item) => {
      calls++;
      return item.id === 'flaky' && calls < 3
        ? { status: 'failed', reason: 'upload_failed' }
        : done(`call-${item.id}`);
    };
    const q = await BulkQueue.create(
      planBatch(pairFiles([ref('flaky.txt'), ref('ok.txt')]), { backupRecordings: true }),
      { store, run, concurrency: { transcription: 1, indexing: 1 } },
    );
    q.pause();
    q.start();
    q.pause();
    await q.whenIdle();
    expect(q.counts().done + q.counts().failed).toBeLessThanOrEqual(2);
    q.resume();
    await q.whenIdle();
    expect(q.items.find((i) => i.id === 'flaky')?.status).toBe('failed');
    expect(q.items.find((i) => i.id === 'flaky')?.reason).toBe('upload_failed');
    expect(q.retry(['ok'])).toBe(0);
    expect(q.retry()).toBe(1);
    await q.whenIdle();
    expect(q.items.find((i) => i.id === 'flaky')).toMatchObject({ status: 'done', attempts: 2 });

    const keys = (o: object): string[] =>
      Object.entries(o).flatMap(([k, v]) => [
        k,
        ...(v && typeof v === 'object' && !Array.isArray(v) ? keys(v) : []),
      ]);
    const itemKeys = new Set(store.state!.items.flatMap((i) => keys(i)));
    expect([...itemKeys].sort()).toEqual(
      [
        'attempts',
        'audio',
        'callId',
        'existingId',
        'id',
        'name',
        'reason',
        'ref',
        'size',
        'status',
        'transcript',
      ].sort(),
    );
    expect(store.state?.backupRecordings).toBe(true);
  });

  it('restores after a reload: in-flight items go back to queued', async () => {
    const store = new MemoryBulkStateStore();
    const r = controlledRunner();
    const q = await BulkQueue.create(planBatch(pairFiles([ref('a.txt'), ref('b.txt')])), {
      store,
      run: r.run,
    });
    q.start();
    await tick();
    expect(store.state?.items.map((i) => i.status)).toEqual(['indexing', 'indexing']);
    r.release('a', done('ca'));
    await tick();
    await tick();

    const r2 = controlledRunner();
    const restored = (await BulkQueue.restore({ store, run: r2.run }))!;
    expect(restored.items.map((i: BulkItemState) => [i.id, i.status])).toEqual([
      ['a', 'done'],
      ['b', 'queued'],
    ]);
    restored.start();
    await tick();
    expect(r2.started).toEqual(['b']);
    r2.release('b', done('cb'));
    await restored.whenIdle();
    expect(restored.counts()).toMatchObject({ done: 2 });
    await restored.clear();
    expect(await BulkQueue.restore({ store, run: r2.run })).toBeNull();
  });

  it('turns a throwing runner into a failed item', async () => {
    const q = await BulkQueue.create(planBatch(pairFiles([ref('x.txt')])), {
      store: new MemoryBulkStateStore(),
      run: async () => {
        throw new Error('boom');
      },
    });
    q.start();
    await q.whenIdle();
    expect(q.items[0]).toMatchObject({ status: 'failed', reason: 'unknown' });
  });
});
