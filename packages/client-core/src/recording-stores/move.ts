import {
  getCall,
  listCalls,
  recordingDownload,
  recordingUpload,
  updateCall,
} from '@askcalls/api-contract/routes/calls';
import type { ClientContext } from '../context';
import type { Providers } from '../userdata';
import { knownStores } from './refs';

/** Where a call's recording is: null for the instance bucket, else a store's `bucketRef`. */
export interface StoredRecording {
  callId: string;
  bucketRef: string | null;
  objectKey: string;
}

/** Every call that has a recording, with where it is. Ids and refs only. */
export async function storedRecordings(ctx: ClientContext): Promise<StoredRecording[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const page: { items: Array<{ id: string; hasRecording: boolean }>; nextCursor: string | null } =
      await ctx.api.request(listCalls, { query: { limit: 100, ...(cursor && { cursor }) } });
    for (const c of page.items) if (c.hasRecording) ids.push(c.id);
    cursor = page.nextCursor;
  } while (cursor);
  const out: StoredRecording[] = [];
  for (const id of ids) {
    const call = await ctx.api.request(getCall, { params: { id } });
    if (call.recording) {
      out.push({
        callId: id,
        bucketRef: call.recording.bucketRef,
        objectKey: call.recording.objectKey,
      });
    }
  }
  return out;
}

/**
 * Recordings this device can move to `target` (null: the instance bucket): those elsewhere, in
 * the instance bucket or in a store it still has credentials for.
 */
export function movable(
  p: Providers,
  recordings: readonly StoredRecording[],
  target: string | null,
): StoredRecording[] {
  const readable = new Set(knownStores(p).map((s) => s.ref));
  return recordings.filter(
    (r) => r.bucketRef !== target && (r.bucketRef === null || readable.has(r.bucketRef)),
  );
}

async function readCiphertext(ctx: ClientContext, r: StoredRecording): Promise<Uint8Array> {
  if (r.bucketRef === null) {
    if (!ctx.fetcher) throw new Error('no blob fetcher');
    const where = await ctx.api.request(recordingDownload, { params: { id: r.callId } });
    if (where.location !== 'instance') throw new Error('recording moved meanwhile');
    return ctx.fetcher.get({ url: where.url, headers: where.headers });
  }
  if (!ctx.ownStores) throw new Error('no own-store adapter');
  const parts: Uint8Array[] = [];
  for await (const p of ctx.ownStores.get(r.bucketRef, r.objectKey)) parts.push(p);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Copies each recording's ciphertext to `target` and points the call at it (spec 11.2a "migrate
 * on the device"). Nothing is decrypted. The server drops an instance copy itself; a copy in an
 * own store is deleted here, and also queued for the sweep in case this tab closes first.
 */
export async function moveRecordings(
  ctx: ClientContext,
  target: string | null,
  recordings: readonly StoredRecording[],
  opts: { onProgress?: (done: number) => void; signal?: AbortSignal } = {},
): Promise<{ moved: number; failed: number }> {
  let moved = 0;
  let failed = 0;
  for (const r of recordings) {
    if (opts.signal?.aborted) break;
    try {
      const ct = await readCiphertext(ctx, r);
      let objectKey: string;
      if (target === null) {
        if (!ctx.uploader) throw new Error('no recording uploader');
        const presigned = await ctx.api.request(recordingUpload, {
          params: { id: r.callId },
          body: { bytes: ct.length, contentType: 'application/octet-stream' },
        });
        await ctx.uploader.put(presigned, ct);
        objectKey = presigned.objectKey;
      } else {
        if (!ctx.ownStores) throw new Error('no own-store adapter');
        ({ objectKey } = await ctx.ownStores.put(target, r.callId, ct));
      }
      await ctx.api.request(updateCall, {
        params: { id: r.callId },
        body: { recording: { bucketRef: target, objectKey, bytes: ct.length } },
      });
      if (r.bucketRef !== null) {
        await ctx.ownStores?.delete(r.bucketRef, r.objectKey).catch(() => {});
      }
      moved++;
    } catch {
      failed++;
    }
    opts.onProgress?.(moved + failed);
  }
  return { moved, failed };
}
