import type { AuditAction, AuditActor, AuditEvent, AuditLog } from '@askcalls/domain';
import { and, desc, eq, type SQL, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { decodeCursor, encodeCursor, pageLimit } from '../codec';
import type { Driver } from '../driver';
import { auditEvents } from '../schema';
import { healthCheck } from './health';

const CURSOR = 'a';

const toEvent = (r: typeof auditEvents.$inferSelect): AuditEvent => ({
  id: r.id,
  userId: r.userId,
  at: r.at,
  actor: r.actor as AuditActor,
  action: r.action as AuditAction,
  callId: r.callId,
  meta: r.meta,
});

/** Append-only audit trail, newest first with an (at, id) keyset cursor. */
export function createAuditLog(d: Driver): AuditLog {
  return {
    healthCheck: () => healthCheck(d),

    append: async (e) => {
      await d.asUser(e.userId, (tx) =>
        tx.insert(auditEvents).values({
          id: uuidv7(),
          userId: e.userId,
          at: new Date(),
          actor: e.actor,
          action: e.action,
          callId: e.callId,
          meta: { ...e.meta },
        }),
      );
    },

    list: async (userId, page, filter) => {
      const limit = pageLimit(page.limit);
      const where: SQL[] = [eq(auditEvents.userId, userId)];
      if (filter?.action) where.push(eq(auditEvents.action, filter.action));
      if (page.cursor) {
        const [atMs, id] = decodeCursor(page.cursor, CURSOR, ['n', 's']) as [number, string];
        const at = new Date(atMs).toISOString();
        where.push(sql`(${auditEvents.at}, ${auditEvents.id}) < (${at}::timestamptz, ${id}::text)`);
      }
      const rs = await d.asUser(userId, (tx) =>
        tx
          .select()
          .from(auditEvents)
          .where(and(...where))
          .orderBy(desc(auditEvents.at), desc(auditEvents.id))
          .limit(limit + 1),
      );
      const items = rs.slice(0, limit).map(toEvent);
      const last = items[items.length - 1];
      return {
        items,
        nextCursor:
          rs.length > limit && last ? encodeCursor(CURSOR, [last.at.getTime(), last.id]) : null,
      };
    },
  };
}
