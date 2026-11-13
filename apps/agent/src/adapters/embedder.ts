import type { Embedder } from '@askcalls/client-core';
import { DomainError, isDomainError } from '@askcalls/domain';
import { EMBEDDING_MODEL, EMBEDDING_MODEL_ID, ensureModelFiles } from './model-files';
import { loadWebExtractor } from './onnx-web';
import { type FeatureExtractor, isCompiledBinary, workerExtractor } from './runtime';

/**
 * The browser's embedding model (the same pruned multilingual-e5-small files and SHA-256 pins,
 * see model-files.ts) through @huggingface/transformers on onnxruntime-web's WebAssembly
 * backend (onnx-web.ts), in this process or, for the single binary, in a worker process. Like
 * the browser, it runs one text per inference: the q8 model quantizes activations per batch,
 * so batching would make a vector depend on its neighbours. The files are downloaded once into the
 * agent's data directory from the model host (`modelUrl`, resolved on first use; see
 * agent.ts modelHost), verified on every load, and loaded on first use, so commands that never
 * embed never pay for them.
 */
export class TransformersEmbedder implements Embedder {
  readonly modelId = EMBEDDING_MODEL_ID;
  readonly dimensions = 384 as const;
  readonly minSimilarity = EMBEDDING_MODEL.minSimilarity;
  #extractor: Promise<FeatureExtractor> | null = null;

  constructor(
    private readonly dirs: { models: string; runtime: string },
    private readonly opts: { modelUrl?: string | (() => Promise<string>) } = {
      modelUrl: process.env.ASKCALLS_MODEL_URL,
    },
  ) {}

  async #start(): Promise<FeatureExtractor> {
    const log = (line: string) => console.error(line);
    const { modelUrl } = this.opts;
    const baseUrl = typeof modelUrl === 'function' ? await modelUrl() : modelUrl;
    const { localModelPath, model } = await ensureModelFiles(this.dirs.models, {
      ...(baseUrl && { baseUrl }),
      log,
    });
    return isCompiledBinary()
      ? workerExtractor({
          runtimeDir: this.dirs.runtime,
          localModelPath,
          model,
          dtype: EMBEDDING_MODEL.dtype,
          log,
        })
      : loadWebExtractor(localModelPath, model, EMBEDDING_MODEL.dtype);
  }

  #load(): Promise<FeatureExtractor> {
    this.#extractor ??= this.#start().catch((e) => {
      if (isDomainError(e)) throw e;
      throw new DomainError('unsupported', 'the embedding runtime could not be loaded');
    });
    this.#extractor.catch(() => {
      this.#extractor = null;
    });
    return this.#extractor;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const extract = await this.#load();
    const vectors: Float32Array[] = [];
    for (const text of texts) {
      const out = await extract([text], { pooling: 'mean', normalize: true });
      if (out.dims.at(-1) !== this.dimensions) {
        throw new DomainError('provider_error', 'unexpected embedding size');
      }
      vectors.push(out.data.slice(0, this.dimensions));
    }
    return vectors;
  }
}
