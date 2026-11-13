import { type CallChunk, DomainError } from '@askcalls/domain';
import { sql } from 'drizzle-orm';
import { vectorLiteral } from '../codec';
import type { Db } from '../driver';

/**
 * Replaces every chunk of a call inside `tx`. The caller has locked the call row and checked it
 * belongs to `userId`.
 */
export async function writeChunks(
  tx: Db,
  userId: string,
  callId: string,
  chunks: Omit<CallChunk, 'userId' | 'callId'>[],
): Promise<void> {
  const values = chunks.map((c) => {
    if (!Number.isInteger(c.ord) || c.ord < 0) throw new DomainError('invalid', 'invalid ord');
    return sql`(${callId}, ${userId}, ${c.ord}::int, ${c.lang ?? null}::text, ${vectorLiteral(c.embedding)}::halfvec, ${Buffer.from(c.snippetCt)})`;
  });
  await tx.execute(
    sql`DELETE FROM "CallChunk" WHERE "userId" = ${userId} AND "callId" = ${callId}`,
  );
  // Batches keep each statement well under the bind-parameter limit.
  for (let i = 0; i < values.length; i += 500) {
    await tx.execute(
      sql`INSERT INTO "CallChunk" ("callId", "userId", "ord", "lang", "embedding", "snippetCt") VALUES ${sql.join(values.slice(i, i + 500), sql`, `)}`,
    );
  }
}
