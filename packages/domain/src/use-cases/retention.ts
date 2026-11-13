import { dayFromDate } from '../entities/common';
import { DomainError } from '../entities/errors';
import type { Ports } from '../ports-bundle';
import { deleteCallFor } from './calls';
import { type Actor, audit, requireSession, requireUser } from './context';

export const RETENTION_MAX_DAYS = 36_500;
const PURGE_BATCH = 100;

export async function getRetention(
  ports: Ports,
  actor: Actor,
): Promise<{ retentionDays: number | null }> {
  requireSession(actor);
  return { retentionDays: (await requireUser(ports, actor.userId)).retentionDays };
}

/** `retentionDays` is a plaintext policy; it holds no content. Null keeps calls forever. */
export async function setRetention(
  ports: Ports,
  actor: Actor,
  retentionDays: number | null,
): Promise<{ retentionDays: number | null }> {
  requireSession(actor);
  if (
    retentionDays !== null &&
    (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > RETENTION_MAX_DAYS)
  ) {
    throw new DomainError('invalid', 'retention must be 1..36500 days or forever');
  }
  const user = await ports.users.update(actor.userId, { retentionDays });
  await audit(ports, actor, actor.userId, 'retention.update', null, {
    retentionDays: user.retentionDays,
  });
  return { retentionDays: user.retentionDays };
}

export interface PurgeResult {
  usersProcessed: number;
  callsDeleted: number;
  inboxExpired: number;
  linkSessionsExpired: number;
}

/**
 * Daily job (spec 9, /api/cron/retention): deletes calls with `day < today − retentionDays`,
 * expired inbox items with their blobs, and expired device-link sessions. Recordings in a
 * user's own bucket are queued for the device as `recording.orphaned` audit events.
 */
export async function runRetentionPurge(ports: Ports): Promise<PurgeResult> {
  const now = ports.clock.now();
  const today = dayFromDate(now);
  let callsDeleted = 0;
  const users = await ports.users.listWithRetention();
  for (const { id: userId, retentionDays } of users) {
    const beforeDay = today - retentionDays;
    let deletedForUser = 0;
    for (;;) {
      const ids = await ports.calls.listIdsBefore(userId, beforeDay, PURGE_BATCH);
      let deletedInBatch = 0;
      for (const id of ids) {
        if (await deleteCallFor(ports, 'system', userId, id)) deletedInBatch++;
      }
      deletedForUser += deletedInBatch;
      if (ids.length < PURGE_BATCH || deletedInBatch === 0) break;
    }
    if (deletedForUser > 0) {
      await audit(ports, 'system', userId, 'retention.purge', null, {
        calls: deletedForUser,
        beforeDay,
      });
    }
    callsDeleted += deletedForUser;
  }

  const expired = await ports.inbox.deleteExpired(now);
  for (const item of expired) {
    if (item.blobKey) await ports.blobs.delete(item.blobKey);
  }
  const linkSessionsExpired = await ports.keyring.deleteExpiredLinkSessions(now);
  return {
    usersProcessed: users.length,
    callsDeleted,
    inboxExpired: expired.length,
    linkSessionsExpired,
  };
}
