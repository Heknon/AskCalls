import { DomainError, type UserDataStore } from '@askcalls/domain';
import { and, eq } from 'drizzle-orm';
import type { Driver } from '../driver';
import { userData } from '../schema';
import { healthCheck } from './health';

/** Encrypted per-user blobs with optimistic concurrency on `version`. */
export function createUserDataStore(d: Driver): UserDataStore {
  return {
    healthCheck: () => healthCheck(d),

    get: async (userId, kind) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .select()
          .from(userData)
          .where(and(eq(userData.userId, userId), eq(userData.kind, kind))),
      );
      return r ? { kind: r.kind, ct: r.ct, version: r.version } : null;
    },

    put: async (userId, kind, ct, expectedVersion) =>
      d.asUser(userId, async (tx) => {
        const written =
          expectedVersion === 0
            ? await tx
                .insert(userData)
                .values({ userId, kind, ct, version: 1 })
                .onConflictDoNothing()
                .returning({ version: userData.version })
            : await tx
                .update(userData)
                .set({ ct, version: expectedVersion + 1 })
                .where(
                  and(
                    eq(userData.userId, userId),
                    eq(userData.kind, kind),
                    eq(userData.version, expectedVersion),
                  ),
                )
                .returning({ version: userData.version });
        if (written[0]) return written[0].version;
        const [current] = await tx
          .select({ version: userData.version })
          .from(userData)
          .where(and(eq(userData.userId, userId), eq(userData.kind, kind)));
        throw new DomainError('version_conflict', 'user data changed', {
          current: current?.version ?? 0,
        });
      }),
  };
}
