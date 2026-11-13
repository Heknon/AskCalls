import type { Embedder } from '@askcalls/client-core/ports/index';
import { EMBEDDING_MODEL } from '../../assets';

const DIMS = 384;

function hash(word: string): number {
  let h = 2166136261;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * E2E stand-in for the embedding model (`testEmbedderEnabled` on the server): a normalized bag
 * of hashed words. Deterministic and instant; keyword search and indexing work, meaning search
 * only matches shared words. Never loaded unless the server runs with NODE_ENV=test.
 */
export class TestEmbedder implements Embedder {
  readonly modelId = EMBEDDING_MODEL.id;
  readonly dimensions = DIMS;

  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((text) => {
      const v = new Float32Array(DIMS);
      for (const w of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) v[hash(w) % DIMS]! += 1;
      let norm = 0;
      for (const x of v) norm += x * x;
      norm = Math.sqrt(norm) || 1;
      return v.map((x) => x / norm);
    });
  }
}
