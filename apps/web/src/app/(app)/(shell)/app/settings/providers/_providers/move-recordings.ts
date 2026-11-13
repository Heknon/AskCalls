import {
  getCall,
  listCalls,
  recordingDownload,
  updateCall,
} from '@askcalls/api-contract/routes/calls';
import type { ClientContext } from '@askcalls/client-core/context';
import { randomId } from '@askcalls/client-core/userdata';

/** Calls whose recording is in the instance bucket. Ids only. */
export async function instanceRecordings(ctx: ClientContext): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const page: { items: Array<{ id: string; hasRecording: boolean }>; nextCursor: string | null } =
      await ctx.api.request(listCalls, { query: { limit: 100, ...(cursor && { cursor }) } });
    for (const c of page.items) if (c.hasRecording) ids.push(c.id);
    cursor = page.nextCursor;
  } while (cursor);
  const out: string[] = [];
  for (const id of ids) {
    const call = await ctx.api.request(getCall, { params: { id } });
    if (call.recording && call.recording.bucketRef === null) out.push(id);
  }
  return out;
}

/**
 * Copies each recording's ciphertext from the instance bucket to the user's bucket, then
 * points the call at it; the server then drops the instance copy (spec 11.2a "migrate on the
 * device"). Recordings stay encrypted throughout: nothing is decrypted to move them.
 */
export async function moveRecordings(
  ctx: ClientContext,
  bucketRef: string,
  ids: readonly string[],
  opts: { onProgress: (done: number) => void; signal: AbortSignal },
): Promise<{ moved: number; failed: number }> {
  if (!ctx.fetcher || !ctx.ownBuckets) return { moved: 0, failed: ids.length };
  let moved = 0;
  let failed = 0;
  for (const id of ids) {
    if (opts.signal.aborted) break;
    try {
      const where = await ctx.api.request(recordingDownload, { params: { id } });
      if (where.location !== 'instance') continue;
      const ct = await ctx.fetcher.get({ url: where.url, headers: where.headers });
      const objectKey = `askcalls/${id}/${randomId()}`;
      await ctx.ownBuckets.put(bucketRef, objectKey, ct);
      await ctx.api.request(updateCall, {
        params: { id },
        body: { recording: { bucketRef, objectKey, bytes: ct.length } },
      });
      moved++;
    } catch {
      failed++;
    }
    opts.onProgress(moved + failed);
  }
  return { moved, failed };
}
