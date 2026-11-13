import {
  type Call,
  type CallRepository,
  type CallSummary,
  DomainError,
  type DurationBucket,
  type RecordingRef,
} from '@askcalls/domain';
import { and, asc, desc, eq, gte, isNull, lt, lte, or, type SQL, sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor, pageLimit, tokParam } from '../codec';
import type { Db, Driver } from '../driver';
import { calls } from '../schema';
import { healthCheck } from './health';

type CallRow = typeof calls.$inferSelect;

function recordingOf(r: Pick<CallRow, 'recordingBucketRef' | 'recordingKey' | 'recordingBytes'>) {
  return r.recordingKey === null
    ? null
    : ({
        bucketRef: r.recordingBucketRef,
        objectKey: r.recordingKey,
        bytes: r.recordingBytes ?? 0,
      } satisfies RecordingRef);
}

function recordingColumns(rec: RecordingRef | null) {
  return {
    recordingBucketRef: rec?.bucketRef ?? null,
    recordingKey: rec?.objectKey ?? null,
    recordingBytes: rec ? rec.bytes : null,
  };
}

export const toCall = (r: CallRow): Call => ({
  id: r.id,
  userId: r.userId,
  status: r.status,
  source: r.source,
  day: r.day,
  durationBucket: r.durationBucket as DurationBucket,
  wrappedDek: r.wrappedDek,
  transcriptCt: r.transcriptCt,
  metaCt: r.metaCt,
  contactTok: r.contactTok,
  keywordToks: r.keywordToks,
  tagToks: r.tagToks,
  audioTok: r.audioTok,
  contentTok: r.contentTok,
  recording: recordingOf(r),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const summaryColumns = {
  id: calls.id,
  day: calls.day,
  durationBucket: calls.durationBucket,
  wrappedDek: calls.wrappedDek,
  metaCt: calls.metaCt,
  tagToks: calls.tagToks,
  hasRecording: sql<boolean>`${calls.recordingKey} IS NOT NULL`,
};

const DAY_CURSOR = 'd';

/** `(day, id) < cursor` for the newest-first keyset. */
export function dayCursorPredicate(cursor: string): SQL {
  const [day, id] = decodeCursor(cursor, DAY_CURSOR, ['n', 's']) as [number, string];
  return sql`(${calls.day}, ${calls.id}) < (${day}::int, ${id}::text)`;
}

export const dayCursor = (c: { day: number; id: string }) =>
  encodeCursor(DAY_CURSOR, [c.day, c.id]);

async function findDuplicate(
  tx: Db,
  userId: string,
  contentTok: bigint,
  audioTok: bigint | null,
): Promise<string | null> {
  const match =
    audioTok === null
      ? eq(calls.contentTok, contentTok)
      : or(eq(calls.contentTok, contentTok), eq(calls.audioTok, audioTok));
  const [r] = await tx
    .select({ id: calls.id })
    .from(calls)
    .where(and(eq(calls.userId, userId), match))
    .limit(1);
  return r?.id ?? null;
}

export function createCallRepository(d: Driver): CallRepository {
  return {
    healthCheck: () => healthCheck(d),

    create: async (input) =>
      d.asUser(input.userId, async (tx) => {
        const now = new Date();
        const inserted = await tx
          .insert(calls)
          .values({
            id: input.id,
            userId: input.userId,
            status: input.status,
            source: input.source,
            day: input.day,
            durationBucket: input.durationBucket,
            wrappedDek: input.wrappedDek,
            transcriptCt: input.transcriptCt,
            metaCt: input.metaCt,
            contactTok: input.contactTok,
            keywordToks: [...input.keywordToks],
            tagToks: [...input.tagToks],
            audioTok: input.audioTok,
            contentTok: input.contentTok,
            ...recordingColumns(input.recording),
            createdAt: now,
            updatedAt: now,
          })
          // Any unique violation (id, audioTok, contentTok) leaves the transaction usable.
          .onConflictDoNothing()
          .returning();
        if (inserted[0]) return toCall(inserted[0]);
        const existingId = await findDuplicate(tx, input.userId, input.contentTok, input.audioTok);
        if (existingId) throw new DomainError('duplicate', 'call already exists', { existingId });
        throw new DomainError('conflict', 'call id already in use');
      }),

    get: async (userId, id) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .select()
          .from(calls)
          .where(and(eq(calls.userId, userId), eq(calls.id, id))),
      );
      return r ? toCall(r) : null;
    },

    list: async (userId, filter, page) => {
      const limit = pageLimit(page.limit);
      const where: SQL[] = [eq(calls.userId, userId)];
      if (filter.dayFrom !== undefined) where.push(gte(calls.day, filter.dayFrom));
      if (filter.dayTo !== undefined) where.push(lte(calls.day, filter.dayTo));
      if (filter.tagToks?.length) {
        where.push(sql`${calls.tagToks} @> ${sql.param(tokParam(filter.tagToks))}::bigint[]`);
      }
      if (page.cursor) where.push(dayCursorPredicate(page.cursor));
      const rs = await d.asUser(userId, (tx) =>
        tx
          .select(summaryColumns)
          .from(calls)
          .where(and(...where))
          .orderBy(desc(calls.day), desc(calls.id))
          .limit(limit + 1),
      );
      const items: CallSummary[] = rs.slice(0, limit).map((r) => ({
        id: r.id,
        day: r.day,
        durationBucket: r.durationBucket as DurationBucket,
        wrappedDek: r.wrappedDek,
        metaCt: r.metaCt,
        tagToks: r.tagToks,
        hasRecording: r.hasRecording === true,
      }));
      const last = items[items.length - 1];
      return { items, nextCursor: rs.length > limit && last ? dayCursor(last) : null };
    },

    update: async (userId, id, patch) => {
      const set: Partial<typeof calls.$inferInsert> = { updatedAt: new Date() };
      if (patch.metaCt !== undefined) set.metaCt = patch.metaCt;
      if (patch.tagToks !== undefined) set.tagToks = [...patch.tagToks];
      if (patch.recording !== undefined) Object.assign(set, recordingColumns(patch.recording));
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .update(calls)
          .set(set)
          .where(and(eq(calls.userId, userId), eq(calls.id, id)))
          .returning(),
      );
      if (!r) throw new DomainError('not_found', 'call not found');
      return toCall(r);
    },

    delete: async (userId, id) => {
      // CallChunk rows go with it (ON DELETE CASCADE).
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .delete(calls)
          .where(and(eq(calls.userId, userId), eq(calls.id, id)))
          .returning(),
      );
      return r ? toCall(r) : null;
    },

    findIdByAudioTok: async (userId, tok) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .select({ id: calls.id })
          .from(calls)
          .where(and(eq(calls.userId, userId), eq(calls.audioTok, tok))),
      );
      return r?.id ?? null;
    },

    findIdByContentTok: async (userId, tok) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .select({ id: calls.id })
          .from(calls)
          .where(and(eq(calls.userId, userId), eq(calls.contentTok, tok))),
      );
      return r?.id ?? null;
    },

    count: async (userId) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx.select({ n: sql<number>`count(*)::int` }).from(calls).where(eq(calls.userId, userId)),
      );
      return Number(r?.n ?? 0);
    },

    totalRecordingBytes: async (userId) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .select({ n: sql<string>`coalesce(sum(${calls.recordingBytes}), 0)::text` })
          .from(calls)
          // Quota covers the instance bucket only; the user's own buckets are theirs to fill.
          .where(and(eq(calls.userId, userId), isNull(calls.recordingBucketRef))),
      );
      return Number(r?.n ?? 0);
    },

    listIdsBefore: async (userId, beforeDay, limit) => {
      const rs = await d.asUser(userId, (tx) =>
        tx
          .select({ id: calls.id })
          .from(calls)
          .where(and(eq(calls.userId, userId), lt(calls.day, beforeDay)))
          .orderBy(asc(calls.day), asc(calls.id))
          .limit(pageLimit(limit, 10_000)),
      );
      return rs.map((r) => r.id);
    },
  };
}
