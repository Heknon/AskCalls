import { tokenize } from '../src/normalize';

export const FAKE_DIMENSIONS = 384;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic bag-of-words embedder: each token adds ±1 to a hashed dimension, then the vector is
 * L2-normalized. Texts sharing words are similar; disjoint texts are close to orthogonal. Strips
 * the e5 prefixes, which every input carries.
 */
export function fakeEmbedVector(text: string): Float32Array {
  const v = new Float32Array(FAKE_DIMENSIONS);
  const body = text.replace(/^(passage|query): /, '');
  for (const t of tokenize(body)) {
    const h = fnv1a(t);
    v[h % FAKE_DIMENSIONS]! += h & 0x100 ? 1 : -1;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i]! /= norm;
  return v;
}

export function createFakeEmbedder() {
  const calls: string[][] = [];
  return {
    calls,
    embed: async (texts: string[]): Promise<Float32Array[]> => {
      calls.push(texts);
      return texts.map(fakeEmbedVector);
    },
  };
}
