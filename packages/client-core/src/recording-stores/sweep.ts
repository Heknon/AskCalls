import { listAudit } from '@askcalls/api-contract/routes/audit';
import type { ClientContext } from '../context';
import type { SecretStore } from '../ports/index';
import { knownStores } from './refs';

const SWEEP_PAGES = 10;

/**
 * Deletes recordings the server queued for this account's own stores (`recording.orphaned`:
 * deleted calls, retention, replaced recordings), newest first down to `after`, the newest
 * event an earlier sweep finished. Returns the id to pass next time; unchanged when a delete
 * failed, so the next sweep retries (deleting twice is harmless).
 */
export async function sweepOrphanedRecordings(
  ctx: ClientContext,
  after: string | null,
): Promise<string | null> {
  if (!ctx.ownStores) return after;
  const known = new Set(knownStores(await ctx.userData.get('providers')).map((s) => s.ref));
  if (known.size === 0) return after;
  let newest: string | null = null;
  let ok = true;
  let cursor: string | null = null;
  for (let page = 0; page < SWEEP_PAGES; page++) {
    const r: Awaited<ReturnType<typeof listOrphans>> = await listOrphans(ctx, cursor);
    let reached = false;
    for (const e of r.items) {
      if (e.id === after) {
        reached = true;
        break;
      }
      newest ??= e.id;
      const { bucketRef, objectKey } = e.meta;
      if (typeof bucketRef !== 'string' || typeof objectKey !== 'string') continue;
      if (!known.has(bucketRef)) continue;
      await ctx.ownStores.delete(bucketRef, objectKey).catch(() => {
        ok = false;
      });
    }
    cursor = r.nextCursor;
    if (reached || !cursor) break;
  }
  return ok && newest ? newest : after;
}

function listOrphans(ctx: ClientContext, cursor: string | null) {
  return ctx.api.request(listAudit, {
    query: { action: 'recording.orphaned', limit: 100, ...(cursor && { cursor }) },
  });
}

const SWEEP_MARK = 'recording-sweep-after';

/** The sweep at unlock, remembering on this device how far it got. */
export async function sweepAtUnlock(ctx: ClientContext, secrets: SecretStore): Promise<void> {
  const mark = await secrets.get(SWEEP_MARK);
  const after = mark ? new TextDecoder().decode(mark) : null;
  const next = await sweepOrphanedRecordings(ctx, after);
  if (next && next !== after) await secrets.set(SWEEP_MARK, new TextEncoder().encode(next));
}
