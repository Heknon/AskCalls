import type { VocabDelta, VocabularyStore } from '@askcalls/domain';
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { Db, Driver } from '../driver';
import { vocabDeltas } from '../schema';
import { healthCheck } from './health';

const toDelta = (r: typeof vocabDeltas.$inferSelect): VocabDelta => ({ ...r });

/** Serializes appends and compactions per user so `seq` stays dense and increasing. */
async function lockUser(tx: Db, userId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`vocab:${userId}`}, 0))`);
}

export function createVocabularyStore(d: Driver): VocabularyStore {
  return {
    healthCheck: () => healthCheck(d),

    listSince: async (userId, afterSeq) => {
      const rs = await d.asUser(userId, (tx) =>
        tx
          .select()
          .from(vocabDeltas)
          .where(and(eq(vocabDeltas.userId, userId), gt(vocabDeltas.seq, afterSeq)))
          .orderBy(asc(vocabDeltas.seq)),
      );
      return rs.map(toDelta);
    },

    append: async (userId, ct) =>
      d.asUser(userId, async (tx) => {
        await lockUser(tx, userId);
        const [top] = await tx
          .select({ seq: sql<number>`coalesce(max(${vocabDeltas.seq}), 0)::int` })
          .from(vocabDeltas)
          .where(eq(vocabDeltas.userId, userId));
        const [r] = await tx
          .insert(vocabDeltas)
          .values({
            id: uuidv7(),
            userId,
            seq: Number(top?.seq ?? 0) + 1,
            ct,
            compacted: false,
            createdAt: new Date(),
          })
          .returning();
        return toDelta(r!);
      }),

    compact: async (userId, upToSeq, ct) =>
      d.asUser(userId, async (tx) => {
        await lockUser(tx, userId);
        await tx
          .delete(vocabDeltas)
          .where(and(eq(vocabDeltas.userId, userId), lte(vocabDeltas.seq, upToSeq)));
        const [r] = await tx
          .insert(vocabDeltas)
          .values({
            id: uuidv7(),
            userId,
            seq: upToSeq,
            ct,
            compacted: true,
            createdAt: new Date(),
          })
          .returning();
        return toDelta(r!);
      }),

    count: async (userId) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .select({ n: sql<number>`count(*)::int` })
          .from(vocabDeltas)
          .where(eq(vocabDeltas.userId, userId)),
      );
      return Number(r?.n ?? 0);
    },
  };
}
