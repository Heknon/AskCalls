/// <reference lib="webworker" />
import { env, type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers';
import { EMBEDDING_MODEL, MODEL_BASE_PATH, ORT_BASE_PATH } from '../../assets';
import type { EmbedderDevice, EmbedderEvent, EmbedderRequest } from './protocol';

/**
 * multilingual-e5-small in a dedicated worker (spec 3.3): mean pooling, L2-normalized, 384
 * dimensions. Model and ONNX Runtime files come from this origin only: remote models are off
 * and the WebAssembly paths point at /ort. Texts are never logged or stored.
 */
declare const self: DedicatedWorkerGlobalScope;

const origin = self.location.origin;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL(MODEL_BASE_PATH, origin).href;
// Model files persist in Cache Storage (public weights, no user data). The ORT factory is
// imported by URL rather than as a blob, so a worker CSP without `blob:` still works.
env.useBrowserCache = true;
env.useWasmCache = false;

function setWasmPaths(device: EmbedderDevice) {
  const name = device === 'webgpu' ? 'ort-wasm-simd-threaded.asyncify' : 'ort-wasm-simd-threaded';
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } };
  if (!onnx.wasm) throw new Error('onnxruntime-web WebAssembly backend missing');
  onnx.wasm.wasmPaths = {
    mjs: new URL(`${ORT_BASE_PATH}${name}.mjs`, origin).href,
    wasm: new URL(`${ORT_BASE_PATH}${name}.wasm`, origin).href,
  };
  // Threads need cross-origin isolation, which the app does not enable.
  if (!self.crossOriginIsolated) onnx.wasm.numThreads = 1;
}

const post = (e: EmbedderEvent, transfer: Transferable[] = []) => self.postMessage(e, transfer);

let extractor: Promise<FeatureExtractionPipeline> | null = null;
const cancelled = new Set<number>();
let queue: Promise<void> = Promise.resolve();

async function webGpuAvailable(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

async function create(device: EmbedderDevice): Promise<FeatureExtractionPipeline> {
  setWasmPaths(device);
  return (await pipeline('feature-extraction', EMBEDDING_MODEL.id, {
    device,
    dtype: EMBEDDING_MODEL.dtype,
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.file) {
        post({ type: 'progress', file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 });
      }
    },
  })) as FeatureExtractionPipeline;
}

function load(prefer: EmbedderDevice | 'auto'): Promise<FeatureExtractionPipeline> {
  extractor ??= (async () => {
    const started = performance.now();
    let device: EmbedderDevice = prefer === 'auto' ? 'webgpu' : prefer;
    if (device === 'webgpu' && !(await webGpuAvailable())) device = 'wasm';
    let p: FeatureExtractionPipeline;
    try {
      p = await create(device);
    } catch (e) {
      if (device === 'wasm') throw e;
      device = 'wasm';
      p = await create(device);
    }
    post({ type: 'ready', device, loadMs: Math.round(performance.now() - started) });
    return p;
  })();
  extractor.catch(() => {
    extractor = null;
    post({ type: 'load_failed' });
  });
  return extractor;
}

async function embed(id: number, texts: string[], batchSize: number) {
  const out = new Float32Array(texts.length * EMBEDDING_MODEL.dimensions);
  try {
    const p = await load('auto');
    // Similar lengths in one batch waste less padding.
    const order = texts.map((t, i) => [t.length, i] as const).sort((a, b) => a[0] - b[0]);
    for (let b = 0; b < order.length; b += batchSize) {
      if (cancelled.has(id)) throw new Error('cancelled');
      const idx = order.slice(b, b + batchSize).map(([, i]) => i);
      const t = await p(
        idx.map((i) => texts[i]!),
        { pooling: 'mean', normalize: true },
      );
      const data = t.data as Float32Array;
      idx.forEach((i, k) => {
        out.set(
          data.subarray(k * EMBEDDING_MODEL.dimensions, (k + 1) * EMBEDDING_MODEL.dimensions),
          i * EMBEDDING_MODEL.dimensions,
        );
      });
      t.dispose?.();
    }
    post({ type: 'result', id, vectors: out, count: texts.length }, [out.buffer]);
  } catch {
    post({ type: 'failed', id, cancelled: cancelled.has(id) });
  } finally {
    cancelled.delete(id);
  }
}

self.onmessage = ({ data }: MessageEvent<EmbedderRequest>) => {
  if (data.type === 'cancel') {
    cancelled.add(data.id);
    return;
  }
  if (data.type === 'load') {
    load(data.prefer).catch(() => {});
    return;
  }
  const { id, texts, batchSize } = data;
  queue = queue.then(() => embed(id, texts, batchSize));
};
