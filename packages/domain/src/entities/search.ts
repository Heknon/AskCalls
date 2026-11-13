import type { CallSummary } from './call';
import type { Bytes, Day, Token } from './common';

export const EMBEDDING_DIMENSIONS = 384;

/** Spec 9.1. Every predicate is optional except the user scope, which the use case adds. */
export interface SearchQuery {
  /** AND across groups, OR within a group (each group = one term's fuzzy variants). */
  keywordGroups: Token[][];
  /** OR. */
  contactToks?: Token[];
  /** AND: all required. */
  tagToks?: Token[];
  excludeTagToks?: Token[];
  dayFrom?: Day;
  dayTo?: Day;
  /** Query embedding (e5 `query: ` prefix), 384 dimensions. */
  vector?: Float32Array;
  limit: number;
  cursor?: string | null;
}

export interface SearchHit extends CallSummary {
  /** Snippet of the best-matching chunk, present when `vector` was given. */
  bestSnippetCt: Bytes | null;
  bestChunkOrd: number | null;
  /** Cosine similarity of the best chunk (0..1), present when `vector` was given. */
  score: number | null;
}
