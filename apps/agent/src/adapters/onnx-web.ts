import { createRequire } from 'node:module';
import type { FeatureExtractor } from './runtime';

/**
 * transformers.js on onnxruntime-web's WebAssembly backend, single-threaded: the same ONNX
 * Runtime build, kernels and settings the browser's embedder runs, so the agent's vectors
 * match the browser's (onnxruntime-node's native kernels round the int8 activations
 * differently). transformers.js uses a runtime registered under `Symbol.for('onnxruntime')`;
 * the worker script in runtime.ts does the same.
 */
export async function loadWebExtractor(
  localModelPath: string,
  model: string,
  dtype: string,
): Promise<FeatureExtractor> {
  const require = createRequire(import.meta.resolve('@huggingface/transformers'));
  const ort = await import(require.resolve('onnxruntime-web'));
  (globalThis as Record<symbol, unknown>)[Symbol.for('onnxruntime')] = ort;
  ort.env.wasm.numThreads = 1;
  const { env, pipeline } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.localModelPath = localModelPath;
  return (await pipeline('feature-extraction', model, {
    dtype: dtype as 'q8',
    device: 'auto',
    session_options: { executionProviders: ['wasm'] },
  })) as unknown as FeatureExtractor;
}
