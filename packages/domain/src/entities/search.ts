import type { CallSummary } from './call';
import type { Bytes, Day, Page, Token } from './common';

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
  /** Language of the best chunk: the original's or a translation's (null for older chunks). */
  bestChunkLang: string | null;
  /** Cosine similarity of the best chunk (0..1), present when `vector` was given. */
  score: number | null;
}

/**
 * With `vector`: the median best-chunk score over every call the predicates match (ignoring the
 * cursor) and how many calls that is, so the client can tell a call that stands out from the
 * query's usual score against this user's calls. Null and 0 without `vector`.
 */
export interface SearchPage extends Page<SearchHit> {
  scoreMedian: number | null;
  scoredCalls: number;
}

/** The median of `scores` (the lower middle for an even count); null when empty. */
export function medianOf(scores: readonly number[]): number | null {
  if (!scores.length) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}
