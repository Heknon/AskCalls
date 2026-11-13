/// <reference lib="webworker" />
import { env, type FeatureExtractionPipeline, pipeline } from '@huggingface/transformers';
import { EMBEDDING_MODEL, ORT_BASE_PATH } from '../../assets';
import { ModelFiles } from './model-files';
import type { EmbedderDevice, EmbedderEvent, EmbedderRequest } from './protocol';

/**
 * multilingual-e5-small in a dedicated worker (spec 3.3): mean pooling, L2-normalized, 384
 * dimensions. ONNX Runtime comes from this origin (/ort). Model files come from the directory
 * the page passes in `load`, through ModelFiles, which checks each against its pinned SHA-256
 * before transformers.js parses it; the library itself never fetches. Texts are never logged
 * or stored.
 */
declare const self: DedicatedWorkerGlobalScope;

const origin = self.location.origin;
/** A path, not a URL: transformers.js only looks up "local" files for non-URL paths. */
const MODEL_PREFIX = '/askcalls-model/';
const MODEL_NAME = 'e5';
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = MODEL_PREFIX;
// ModelFiles keeps verified bytes in Cache Storage. The ORT factory is imported by URL rather
// than as a blob, so a worker CSP without `blob:` still works.
env.useBrowserCache = false;
env.useWasmCache = false;

let files: ModelFiles | null = null;

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
  return (await pipeline('feature-extraction', MODEL_NAME, {
    device,
    dtype: EMBEDDING_MODEL.dtype,
  })) as FeatureExtractionPipeline;
}

function load(
  prefer: EmbedderDevice | 'auto',
  modelUrl?: string,
): Promise<FeatureExtractionPipeline> {
  if (modelUrl && !files) {
    files = new ModelFiles(modelUrl, origin, (file, loaded, total) =>
      post({ type: 'progress', file, loaded, total }),
    );
    env.fetch = files.fetchFor(`${MODEL_PREFIX}${MODEL_NAME}/`);
  }
  extractor ??= (async () => {
    if (!files) throw new Error('model location not set');
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
    post({ type: 'load_failed', reason: files?.verificationFailed ? 'verification' : 'other' });
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
    load(data.prefer, data.modelUrl).catch(() => {});
    return;
  }
  const { id, texts, batchSize } = data;
  queue = queue.then(() => embed(id, texts, batchSize));
};
