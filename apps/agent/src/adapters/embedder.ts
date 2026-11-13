import type { Embedder } from '@askcalls/client-core';
import { DomainError } from '@askcalls/domain';

/** The model the web app embeds with (EMBEDDING_MODEL default), so vectors are comparable. */
export const EMBEDDING_MODEL = 'Xenova/multilingual-e5-small';

/** Texts per forward pass; padding to the longest text makes large batches costly. */
const BATCH = 16;

type FeatureExtractor = (
  texts: string[],
  opts: { pooling: 'mean'; normalize: true },
) => Promise<{ data: Float32Array; dims: number[] }>;

/**
 * multilingual-e5-small through @huggingface/transformers on onnxruntime-node. The model is
 * downloaded once into the agent's data directory and loaded on first use, so commands that
 * never embed (login, link) never pay for it.
 */
export class TransformersEmbedder implements Embedder {
  readonly modelId = EMBEDDING_MODEL;
  readonly dimensions = 384 as const;
  #extractor: Promise<FeatureExtractor> | null = null;

  constructor(private readonly cacheDir: string) {}

  #load(): Promise<FeatureExtractor> {
    this.#extractor ??= import('@huggingface/transformers').then(
      async ({ env, pipeline }) => {
        env.cacheDir = this.cacheDir;
        return (await pipeline('feature-extraction', EMBEDDING_MODEL, {
          dtype: 'q8',
        })) as unknown as FeatureExtractor;
      },
      () => {
        throw new DomainError('unsupported', 'the embedding runtime could not be loaded');
      },
    );
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
