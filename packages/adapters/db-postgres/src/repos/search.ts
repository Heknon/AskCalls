import {
  DomainError,
  type DurationBucket,
  type SearchHit,
  type SearchIndex,
  type SearchQuery,
} from '@askcalls/domain';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import {
  decodeCursor,
  encodeCursor,
  pageLimit,
  toBigIntArray,
  toBytes,
  toBytesOrNull,
  tokParam,
  toNumber,
  vectorLiteral,
} from '../codec';
import { type Driver, rows } from '../driver';
import { calls } from '../schema';
import { dayCursor, dayCursorPredicate } from './calls';
import { healthCheck } from './health';

const MAX_SEARCH_LIMIT = 50;
const VECTOR_CURSOR = 'v';

const tokens = (toks: readonly bigint[]) => sql`${sql.param(tokParam(toks))}::bigint[]`;

/** Every predicate of spec 9.1 on "Call", user scope first. */
function callPredicates(userId: string, q: SearchQuery): SQL[] {
  const where: SQL[] = [sql`${calls.userId} = ${userId}`];
  for (const group of q.keywordGroups) {
    // An empty OR-group matches nothing, like `some` over an empty list.
    where.push(group.length ? sql`${calls.keywordToks} && ${tokens(group)}` : sql`false`);
  }
  if (q.contactToks?.length) where.push(sql`${calls.contactTok} = ANY(${tokens(q.contactToks)})`);
  if (q.tagToks?.length) where.push(sql`${calls.tagToks} @> ${tokens(q.tagToks)}`);
  if (q.excludeTagToks?.length) {
    where.push(sql`NOT (${calls.tagToks} && ${tokens(q.excludeTagToks)})`);
  }
  if (q.dayFrom !== undefined) where.push(sql`${calls.day} >= ${q.dayFrom}::int`);
  if (q.dayTo !== undefined) where.push(sql`${calls.day} <= ${q.dayTo}::int`);
  return where;
}

interface HitRow {
  id: string;
  day: number;
  durationBucket: number;
  wrappedDek: unknown;
  metaCt: unknown;
  tagToks: unknown;
  hasRecording: boolean;
  bestOrd: number | null;
  bestSnippetCt: unknown;
  dist: number | null;
}

function toHit(r: HitRow): SearchHit {
  const dist = r.dist === null ? null : toNumber(r.dist);
  return {
    id: r.id,
    day: toNumber(r.day),
    durationBucket: toNumber(r.durationBucket) as DurationBucket,
    wrappedDek: toBytes(r.wrappedDek),
    metaCt: toBytes(r.metaCt),
    tagToks: toBigIntArray(r.tagToks),
    hasRecording: r.hasRecording === true,
    bestSnippetCt: toBytesOrNull(r.bestSnippetCt),
    bestChunkOrd: r.bestOrd === null ? null : toNumber(r.bestOrd),
    // Cosine distance is 1 - similarity.
    score: dist === null ? null : 1 - dist,
  };
}

const summarySelect = sql`
  ${calls.id} AS "id", ${calls.day} AS "day", ${calls.durationBucket} AS "durationBucket",
  ${calls.wrappedDek} AS "wrappedDek", ${calls.metaCt} AS "metaCt", ${calls.tagToks} AS "tagToks",
  (${calls.recordingKey} IS NOT NULL) AS "hasRecording"`;

/**
 * pgvector-backed SearchIndex. `search` is one SQL statement per query (spec 9.1):
 * - with a vector, a LATERAL subquery picks each matching call's nearest chunk (cosine
 *   distance on halfvec) and calls are ordered by that distance, id descending on ties;
 * - without one, matching calls are ordered by day descending, id descending.
 * Both use keyset cursors on the ordering columns, so pages are stable under inserts.
 */
export function createSearchIndex(d: Driver): SearchIndex {
  return {
    healthCheck: () => healthCheck(d),

    upsertChunks: async (userId, callId, chunks) => {
      const values = chunks.map((c) => {
        if (!Number.isInteger(c.ord) || c.ord < 0) throw new DomainError('invalid', 'invalid ord');
        return sql`(${callId}, ${userId}, ${c.ord}::int, ${vectorLiteral(c.embedding)}::halfvec, ${Buffer.from(c.snippetCt)})`;
      });
      await d.asUser(userId, async (tx) => {
        const [own] = await tx
          .select({ id: calls.id })
          .from(calls)
          .where(and(eq(calls.userId, userId), eq(calls.id, callId)))
          .for('update');
        if (!own) throw new DomainError('not_found', 'call not found');
        await tx.execute(
          sql`DELETE FROM "CallChunk" WHERE "userId" = ${userId} AND "callId" = ${callId}`,
        );
        // Batches keep each statement well under the bind-parameter limit.
        for (let i = 0; i < values.length; i += 500) {
          await tx.execute(
            sql`INSERT INTO "CallChunk" ("callId", "userId", "ord", "embedding", "snippetCt") VALUES ${sql.join(values.slice(i, i + 500), sql`, `)}`,
          );
        }
      });
    },

    deleteChunks: async (userId, callId) => {
      await d.asUser(userId, (tx) =>
        tx.execute(
          sql`DELETE FROM "CallChunk" WHERE "userId" = ${userId} AND "callId" = ${callId}`,
        ),
      );
    },

    search: async (userId, q) => {
      const limit = Math.min(pageLimit(q.limit), MAX_SEARCH_LIMIT);
      const where = callPredicates(userId, q);

      if (!q.vector) {
        if (q.cursor) where.push(dayCursorPredicate(q.cursor));
        const rs = await d.asUser(userId, (tx) =>
          rows<HitRow>(
            tx,
            sql`SELECT ${summarySelect}, NULL::int AS "bestOrd", NULL::bytea AS "bestSnippetCt",
                  NULL::float8 AS "dist"
                FROM "Call"
                WHERE ${sql.join(where, sql` AND `)}
                ORDER BY ${calls.day} DESC, ${calls.id} DESC
                LIMIT ${limit + 1}`,
          ),
        );
        const items = rs.slice(0, limit).map(toHit);
        const last = items[items.length - 1];
        return { items, nextCursor: rs.length > limit && last ? dayCursor(last) : null };
      }

      const vec = vectorLiteral(q.vector);
      let after = sql`true`;
      if (q.cursor) {
        const [dist, id] = decodeCursor(q.cursor, VECTOR_CURSOR, ['n', 's']) as [number, string];
        after = sql`(best."dist" > ${dist}::float8 OR (best."dist" = ${dist}::float8 AND ${calls.id} < ${id}::text))`;
      }
      const rs = await d.asUser(userId, (tx) =>
        rows<HitRow>(
          tx,
          sql`SELECT ${summarySelect}, best."ord" AS "bestOrd", best."snippetCt" AS "bestSnippetCt",
                best."dist" AS "dist"
              FROM "Call"
              CROSS JOIN LATERAL (
                SELECT ch."ord", ch."snippetCt",
                       (ch."embedding" <=> ${vec}::halfvec(384))::float8 AS "dist"
                FROM "CallChunk" ch
                WHERE ch."callId" = ${calls.id} AND ch."userId" = ${userId}
                ORDER BY "dist", ch."ord"
                LIMIT 1
              ) best
              WHERE ${sql.join(where, sql` AND `)} AND ${after}
              ORDER BY best."dist" ASC, ${calls.id} DESC
              LIMIT ${limit + 1}`,
        ),
      );
      const items = rs.slice(0, limit).map(toHit);
      const lastRow = rs[limit - 1];
      return {
        items,
        nextCursor:
          rs.length > limit && lastRow
            ? encodeCursor(VECTOR_CURSOR, [toNumber(lastRow.dist), lastRow.id])
            : null,
      };
    },
  };
}
