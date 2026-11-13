import type { InboxItem, InboxRepository } from '@askcalls/domain';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { Driver } from '../driver';
import { inboxItems } from '../schema';
import { healthCheck } from './health';

const toItem = (r: typeof inboxItems.$inferSelect): InboxItem => ({ ...r });

/** Inbox items. `deleteExpired` is a cross-user job and uses the system path. */
export function createInboxRepository(d: Driver): InboxRepository {
  return {
    healthCheck: () => healthCheck(d),

    create: async (item) => {
      const [r] = await d.asUser(item.userId, (tx) =>
        tx
          .insert(inboxItems)
          .values({ ...item, createdAt: new Date() })
          .returning(),
      );
      return toItem(r!);
    },

    list: async (userId) => {
      const rs = await d.asUser(userId, (tx) =>
        tx
          .select()
          .from(inboxItems)
          .where(eq(inboxItems.userId, userId))
          .orderBy(asc(inboxItems.createdAt), asc(inboxItems.id)),
      );
      return rs.map(toItem);
    },

    get: async (userId, id) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .select()
          .from(inboxItems)
          .where(and(eq(inboxItems.userId, userId), eq(inboxItems.id, id))),
      );
      return r ? toItem(r) : null;
    },

    delete: async (userId, id) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .delete(inboxItems)
          .where(and(eq(inboxItems.userId, userId), eq(inboxItems.id, id)))
          .returning(),
      );
      return r ? toItem(r) : null;
    },

    count: async (userId) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .select({ n: sql<number>`count(*)::int` })
          .from(inboxItems)
          .where(eq(inboxItems.userId, userId)),
      );
      return Number(r?.n ?? 0);
    },

    deleteExpired: async (now) => {
      const rs = await d.asSystem((db) =>
        db
          .delete(inboxItems)
          .where(lte(inboxItems.expiresAt, now))
          .returning({ userId: inboxItems.userId, blobKey: inboxItems.blobKey }),
      );
      return rs.map((r) => ({ userId: r.userId, blobKey: r.blobKey }));
    },
  };
}
