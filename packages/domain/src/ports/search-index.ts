import type { CallChunk } from '../entities/call';
import type { CallId, Page, UserId } from '../entities/common';
import type { SearchHit, SearchQuery } from '../entities/search';
import type { HealthCheckable } from './health';

export interface SearchIndex extends HealthCheckable {
  /** Replaces all chunks of a call. */
  upsertChunks(
    userId: UserId,
    callId: CallId,
    chunks: Omit<CallChunk, 'userId' | 'callId'>[],
  ): Promise<void>;
  deleteChunks(userId: UserId, callId: CallId): Promise<void>;
  /**
   * One query combining every predicate (spec 9.1). With `vector`, results are ordered by the
   * best chunk similarity per call; otherwise by day descending.
   */
  search(userId: UserId, query: SearchQuery): Promise<Page<SearchHit>>;
}
