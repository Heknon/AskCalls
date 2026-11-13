import {
  type DeviceKey,
  type DeviceLinkSession,
  DomainError,
  type KeyringEntry,
  type KeyringRepository,
} from '@askcalls/domain';
import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import type { Driver } from '../driver';
import { deviceKeys, deviceLinkSessions, keyring, userKeys } from '../schema';
import { healthCheck } from './health';

const toEntry = (r: typeof keyring.$inferSelect): KeyringEntry => ({
  id: r.id,
  userId: r.userId,
  kind: r.kind,
  label: r.label,
  credentialId: r.credentialId,
  wrappedRootKey: r.wrappedRootKey,
  kdfParams: r.kdfParams,
  createdAt: r.createdAt,
  lastUsedAt: r.lastUsedAt,
  revokedAt: r.revokedAt,
});

const toDevice = (r: typeof deviceKeys.$inferSelect): DeviceKey => ({ ...r });

const toLinkSession = (r: typeof deviceLinkSessions.$inferSelect): DeviceLinkSession => ({ ...r });

/**
 * Keyring, inbox keys, device keys and device-link sessions. A device-link session is looked
 * up by its id alone (the joining device has no session yet) and expiry is cross-user, so
 * those three methods use the system path; the id is a 128-bit random value.
 */
export function createKeyringRepository(d: Driver): KeyringRepository {
  return {
    healthCheck: () => healthCheck(d),

    list: async (userId, opts) => {
      const rs = await d.asUser(userId, (tx) =>
        tx
          .select()
          .from(keyring)
          .where(
            opts?.includeRevoked
              ? eq(keyring.userId, userId)
              : and(eq(keyring.userId, userId), isNull(keyring.revokedAt)),
          )
          .orderBy(asc(keyring.createdAt), asc(keyring.id)),
      );
      return rs.map(toEntry);
    },

    get: async (userId, id) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .select()
          .from(keyring)
          .where(and(eq(keyring.userId, userId), eq(keyring.id, id), isNull(keyring.revokedAt))),
      );
      return r ? toEntry(r) : null;
    },

    add: async (entry) => {
      const [r] = await d.asUser(entry.userId, (tx) =>
        tx
          .insert(keyring)
          .values({
            id: entry.id,
            userId: entry.userId,
            kind: entry.kind,
            label: entry.label,
            credentialId: entry.credentialId,
            wrappedRootKey: entry.wrappedRootKey,
            kdfParams: entry.kdfParams,
            createdAt: new Date(),
            lastUsedAt: null,
            revokedAt: null,
          })
          .returning(),
      );
      return toEntry(r!);
    },

    revoke: async (userId, id, at) => {
      // Deleting the wrapped key is the point of revoking; the row stays for the audit trail.
      await d.asUser(userId, (tx) =>
        tx
          .update(keyring)
          .set({ revokedAt: at, wrappedRootKey: new Uint8Array() })
          .where(and(eq(keyring.userId, userId), eq(keyring.id, id))),
      );
    },

    touch: async (userId, id, at) => {
      await d.asUser(userId, (tx) =>
        tx
          .update(keyring)
          .set({ lastUsedAt: at })
          .where(and(eq(keyring.userId, userId), eq(keyring.id, id))),
      );
    },

    getUserKeys: async (userId) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx.select().from(userKeys).where(eq(userKeys.userId, userId)),
      );
      return r ? { ...r } : null;
    },

    putUserKeys: async (keys) => {
      await d.asUser(keys.userId, (tx) =>
        tx
          .insert(userKeys)
          .values({ ...keys })
          .onConflictDoUpdate({
            target: userKeys.userId,
            set: {
              inboxPublicKey: keys.inboxPublicKey,
              inboxPrivateKeyCt: keys.inboxPrivateKeyCt,
              keyVersion: keys.keyVersion,
            },
          }),
      );
    },

    listDevices: async (userId) => {
      const rs = await d.asUser(userId, (tx) =>
        tx
          .select()
          .from(deviceKeys)
          .where(eq(deviceKeys.userId, userId))
          .orderBy(asc(deviceKeys.createdAt), asc(deviceKeys.id)),
      );
      return rs.map(toDevice);
    },

    getDevice: async (userId, id) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .select()
          .from(deviceKeys)
          .where(and(eq(deviceKeys.userId, userId), eq(deviceKeys.id, id))),
      );
      return r ? toDevice(r) : null;
    },

    addDevice: async (device) => {
      const [r] = await d.asUser(device.userId, (tx) =>
        tx
          .insert(deviceKeys)
          .values({ ...device, createdAt: new Date(), revokedAt: null })
          .returning(),
      );
      return toDevice(r!);
    },

    revokeDevice: async (userId, id, at) => {
      await d.asUser(userId, (tx) =>
        tx
          .update(deviceKeys)
          .set({ revokedAt: at })
          .where(and(eq(deviceKeys.userId, userId), eq(deviceKeys.id, id))),
      );
    },

    createLinkSession: async (s) => {
      await d.asUser(s.userId, (tx) => tx.insert(deviceLinkSessions).values({ ...s }));
    },

    getLinkSession: async (id) => {
      const [r] = await d.asSystem((db) =>
        db.select().from(deviceLinkSessions).where(eq(deviceLinkSessions.id, id)),
      );
      return r ? toLinkSession(r) : null;
    },

    updateLinkSession: async (id, patch) => {
      const set: Partial<typeof deviceLinkSessions.$inferInsert> = {};
      if (patch.state !== undefined) set.state = patch.state;
      if (patch.devicePublicKey !== undefined) set.devicePublicKey = patch.devicePublicKey;
      if (patch.deviceLabel !== undefined) set.deviceLabel = patch.deviceLabel;
      if (patch.encryptedRootKey !== undefined) set.encryptedRootKey = patch.encryptedRootKey;
      const rs = await d.asSystem((db) =>
        Object.keys(set).length
          ? db
              .update(deviceLinkSessions)
              .set(set)
              .where(eq(deviceLinkSessions.id, id))
              .returning({ id: deviceLinkSessions.id })
          : db
              .select({ id: deviceLinkSessions.id })
              .from(deviceLinkSessions)
              .where(eq(deviceLinkSessions.id, id)),
      );
      if (!rs.length) throw new DomainError('not_found', 'link session not found');
    },

    deleteExpiredLinkSessions: async (now) => {
      const rs = await d.asSystem((db) =>
        db
          .delete(deviceLinkSessions)
          .where(lte(deviceLinkSessions.expiresAt, now))
          .returning({ id: deviceLinkSessions.id }),
      );
      return rs.length;
    },
  };
}
