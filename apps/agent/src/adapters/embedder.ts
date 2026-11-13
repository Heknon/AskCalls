import type { Embedder } from '@askcalls/client-core';
import { DomainError, isDomainError } from '@askcalls/domain';
import { EMBEDDING_MODEL, EMBEDDING_MODEL_ID, ensureModelFiles } from './model-files';
import { type FeatureExtractor, isCompiledBinary, workerExtractor } from './runtime';

/** Texts per forward pass; padding to the longest text makes large batches costly. */
const BATCH = 16;

async function inProcess(localModelPath: string, model: string): Promise<FeatureExtractor> {
  const { env, pipeline } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.localModelPath = localModelPath;
  return (await pipeline('feature-extraction', model, {
    dtype: EMBEDDING_MODEL.dtype,
  })) as unknown as FeatureExtractor;
}

/**
 * The browser's embedding model (the same pruned multilingual-e5-small files and SHA-256 pins,
 * see model-files.ts) through @huggingface/transformers on onnxruntime-node, in this process
 * or, for the single binary, in a worker process. The files are downloaded once into the
 * agent's data directory from the model host (ASKCALLS_MODEL_URL, default
 * models.askcalls.com), verified on every load, and loaded on first use, so commands that
 * never embed never pay for them.
 */
export class TransformersEmbedder implements Embedder {
  readonly modelId = EMBEDDING_MODEL_ID;
  readonly dimensions = 384 as const;
  #extractor: Promise<FeatureExtractor> | null = null;

  constructor(
    private readonly dirs: { models: string; runtime: string },
    private readonly opts: { modelUrl?: string } = { modelUrl: process.env.ASKCALLS_MODEL_URL },
  ) {}

  async #start(): Promise<FeatureExtractor> {
    const log = (line: string) => console.error(line);
    const { localModelPath, model } = await ensureModelFiles(this.dirs.models, {
      ...(this.opts.modelUrl && { baseUrl: this.opts.modelUrl }),
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
      : inProcess(localModelPath, model);
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
    for (let o = 0; o < texts.length; o += BATCH) {
      const batch = texts.slice(o, o + BATCH);
      const out = await extract(batch, { pooling: 'mean', normalize: true });
      const dim = out.dims.at(-1) ?? 0;
      if (dim !== this.dimensions) {
        throw new DomainError('provider_error', 'unexpected embedding size');
      }
      for (let i = 0; i < batch.length; i++) vectors.push(out.data.slice(i * dim, (i + 1) * dim));
    }
    return vectors;
  }
}
