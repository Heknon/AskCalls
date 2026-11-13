import type { Page, Token } from '../entities/common';
import { DomainError } from '../entities/errors';
import { EMBEDDING_DIMENSIONS, type SearchHit, type SearchQuery } from '../entities/search';
import type { Ports } from '../ports-bundle';
import { type Actor, audit } from './context';

export const SEARCH_LIMITS = {
  maxLimit: 50,
  keywordGroups: 32,
  /** 32 fuzzy variants per term (spec 7) plus synonyms and Hebrew prefix forms. */
  tokensPerGroup: 128,
  contactToks: 256,
  tagToks: 64,
} as const;

export type SearchInput = SearchQuery & {
  /** The user's `__star` tag token, so each hit can report `starred`. */
  starTok?: Token;
};

export type SearchResult = SearchHit & { starred: boolean | null };

/** Spec 9.1. Validates the request, then runs one scoped query against the SearchIndex. */
export async function searchCalls(
  ports: Ports,
  actor: Actor,
  input: SearchInput,
): Promise<Page<SearchResult>> {
  const { starTok, ...query } = input;
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > SEARCH_LIMITS.maxLimit) {
    throw new DomainError('invalid', 'limit must be 1..50');
  }
  if (query.keywordGroups.length > SEARCH_LIMITS.keywordGroups) {
    throw new DomainError('invalid', 'too many keyword groups');
  }
  for (const g of query.keywordGroups) {
    if (g.length === 0 || g.length > SEARCH_LIMITS.tokensPerGroup) {
      throw new DomainError('invalid', 'each keyword group needs 1..128 tokens');
    }
  }
  if ((query.contactToks?.length ?? 0) > SEARCH_LIMITS.contactToks) {
    throw new DomainError('invalid', 'too many contact tokens');
  }
  if (
    (query.tagToks?.length ?? 0) > SEARCH_LIMITS.tagToks ||
    (query.excludeTagToks?.length ?? 0) > SEARCH_LIMITS.tagToks
  ) {
    throw new DomainError('invalid', 'too many tag tokens');
  }
  if (query.vector) {
    if (query.vector.length !== EMBEDDING_DIMENSIONS) {
      throw new DomainError('invalid', 'vector must have 384 dimensions');
    }
    if (!query.vector.every(Number.isFinite)) {
      throw new DomainError('invalid', 'vector must be finite');
    }
  }
  if (query.dayFrom !== undefined && query.dayTo !== undefined && query.dayFrom > query.dayTo) {
    throw new DomainError('invalid', 'dayFrom is after dayTo');
  }

  const page = await ports.search.search(actor.userId, query);
  await audit(ports, actor, actor.userId, 'call.search', null, {
    count: page.items.length,
    keywordGroups: query.keywordGroups.length,
    semantic: query.vector !== undefined,
  });
  return {
    items: page.items.map((h) => ({
      ...h,
      starred: starTok === undefined ? null : h.tagToks.includes(starTok),
    })),
    nextCursor: page.nextCursor,
  };
}
