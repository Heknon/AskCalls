import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODEL_BUILD_PATH } from '../../assets';
import { WorkerEmbedder } from './embedder';
import type { EmbedderRequest } from './protocol';

class FakeWorker {
  sent: EmbedderRequest[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage(m: EmbedderRequest) {
    this.sent.push(m);
  }
  terminate() {}
  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('WorkerEmbedder', () => {
  it('starts nothing until load or embed, then asks for the configured model host', async () => {
    vi.stubGlobal('location', { origin: 'https://app.example.com' });
    const workers: FakeWorker[] = [];
    const e = new WorkerEmbedder({
      modelBaseUrl: 'https://models.example.com',
      createWorker: () => {
        const w = new FakeWorker();
        workers.push(w);
        return w as unknown as Worker;
      },
    });
    expect(workers).toHaveLength(0);
    expect(e.status).toEqual({ state: 'idle' });

    const ready = e.load();
    expect(workers).toHaveLength(1);
    expect(workers[0]!.sent[0]).toEqual({
      type: 'load',
      prefer: 'auto',
      modelUrl: `https://models.example.com/${MODEL_BUILD_PATH}`,
    });
    const status = e.status;
    expect(status.state === 'loading' && status.progress.total).toBeGreaterThan(30e6);

    workers[0]!.emit({ type: 'progress', file: 'tokenizer.json', loaded: 1000, total: 2000 });
    expect(e.status.state === 'loading' && e.status.progress.loaded).toBe(1000);
    workers[0]!.emit({ type: 'ready', device: 'wasm', loadMs: 5 });
    await expect(ready).resolves.toBe('wasm');
  });

  it('defaults to this origin and reports a verification failure', async () => {
    vi.stubGlobal('location', { origin: 'https://app.example.com' });
    const w = new FakeWorker();
    const e = new WorkerEmbedder({ createWorker: () => w as unknown as Worker });
    const ready = e.load();
    expect((w.sent[0] as { modelUrl: string }).modelUrl).toBe(
      `https://app.example.com/models/${MODEL_BUILD_PATH}`,
    );
    w.emit({ type: 'load_failed', reason: 'verification' });
    await expect(ready).rejects.toMatchObject({ code: 'invalid' });
    expect(e.status).toEqual({ state: 'failed', reason: 'verification' });
  });
});
