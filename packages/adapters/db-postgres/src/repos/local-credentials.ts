import { DomainError, type LocalCredentialRepository, type SignInPasskey } from '@askcalls/domain';
import { eq } from 'drizzle-orm';
import type { Driver } from '../driver';
import { passwordCredentials, signInPasskeys } from '../schema';
import { healthCheck } from './health';

type PasskeyRow = typeof signInPasskeys.$inferSelect;

const toPasskey = (r: PasskeyRow): SignInPasskey => ({
  credentialId: r.credentialId,
  userId: r.userId,
  providerAccountId: r.providerAccountId,
  publicKey: r.publicKey,
  counter: Number(r.counter),
  deviceType: r.deviceType,
  backedUp: r.backedUp,
  transports: r.transports,
});

/**
 * Local-account credentials. A passkey is looked up by credential id before anyone is signed
 * in, and its counter is bumped in the same step, so those two use the system path.
 */
export function createLocalCredentialRepository(d: Driver): LocalCredentialRepository {
  return {
    healthCheck: () => healthCheck(d),

    setPasswordHash: async (userId, hash) => {
      const updatedAt = new Date();
      await d.asUser(userId, (tx) =>
        tx
          .insert(passwordCredentials)
          .values({ userId, hash, updatedAt })
          .onConflictDoUpdate({ target: passwordCredentials.userId, set: { hash, updatedAt } }),
      );
    },

    getPasswordHash: async (userId) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .select({ hash: passwordCredentials.hash })
          .from(passwordCredentials)
          .where(eq(passwordCredentials.userId, userId)),
      );
      return r?.hash ?? null;
    },

    addPasskey: async (p) => {
      const inserted = await d.asUser(p.userId, (tx) =>
        tx
          .insert(signInPasskeys)
          .values({ ...p, createdAt: new Date() })
          .onConflictDoNothing()
          .returning({ id: signInPasskeys.credentialId }),
      );
      if (!inserted.length) throw new DomainError('conflict', 'passkey already registered');
    },

    getPasskey: async (credentialId) => {
      const [r] = await d.asSystem((db) =>
        db.select().from(signInPasskeys).where(eq(signInPasskeys.credentialId, credentialId)),
      );
      return r ? toPasskey(r) : null;
    },

    listPasskeys: async (userId) => {
      const rs = await d.asUser(userId, (tx) =>
        tx
          .select()
          .from(signInPasskeys)
          .where(eq(signInPasskeys.userId, userId))
          .orderBy(signInPasskeys.createdAt, signInPasskeys.credentialId),
      );
      return rs.map(toPasskey);
    },

    updatePasskeyCounter: async (credentialId, counter) => {
      await d.asSystem((db) =>
        db
          .update(signInPasskeys)
          .set({ counter })
          .where(eq(signInPasskeys.credentialId, credentialId)),
      );
    },
  };
}
