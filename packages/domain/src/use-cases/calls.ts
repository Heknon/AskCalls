import type { Call, CallSource, CallSummary, DurationBucket, RecordingRef } from '../entities/call';
import type { Bytes, CallId, Day, Page, Token, UserId } from '../entities/common';
import { DomainError, isDomainError } from '../entities/errors';
import { EMBEDDING_DIMENSIONS } from '../entities/search';
import type { Ports } from '../ports-bundle';
import { type Actor, audit, blobKeys, HOUR_MS } from './context';
import { limitsFor } from './limits';

/**
 * Caps that keep one request bounded. Spec 7.5 caps keyword tokens at 5,000 per text; a call is
 * indexed from its original and up to four translations, so 25,000 per call.
 */
export const CALL_LIMITS = {
  keywordToks: 25_000,
  tagToks: 256,
  chunks: 2_000,
  wrappedDekBytes: 256,
  listPageMax: 100,
  /** Presigned URLs for recordings live this long. */
  presignSec: 900,
} as const;

export interface NewChunkInput {
  ord: number;
  /** ISO 639-1 of the chunk's text; absent or null from clients that predate translations. */
  lang?: string | null;
  embedding: Float32Array;
  snippetCt: Bytes;
}

const LANG = /^[a-z]{2}$/;

export interface CreateCallInput {
  /** Client-chosen UUIDv7: the AAD of every ciphertext binds it, so the client picks it. */
  id: CallId;
  source: CallSource;
  day: Day;
  durationBucket: DurationBucket;
  wrappedDek: Bytes;
  transcriptCt: Bytes;
  metaCt: Bytes;
  contactTok: Token | null;
  keywordToks: Token[];
  tagToks: Token[];
  audioTok: Token | null;
  contentTok: Token;
  chunks: NewChunkInput[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function duplicate(existingId: CallId, match: 'audio' | 'content'): DomainError {
  return new DomainError('duplicate', 'call already exists', { existingId, match });
}

function validateChunks(chunks: NewChunkInput[]): void {
  if (chunks.length > CALL_LIMITS.chunks) throw new DomainError('invalid', 'too many chunks');
  const seen = new Set<number>();
  for (const c of chunks) {
    if (!Number.isInteger(c.ord) || c.ord < 0 || seen.has(c.ord)) {
      throw new DomainError('invalid', 'chunk ord must be unique non-negative integers');
    }
    seen.add(c.ord);
    if (c.lang != null && !LANG.test(c.lang)) {
      throw new DomainError('invalid', 'chunk lang must be an ISO 639-1 code');
    }
    if (c.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new DomainError('invalid', 'embedding must have 384 dimensions');
    }
  }
}

/** Throws `duplicate` with the existing id when the audio or content token is already known. */
async function assertNotDuplicate(
  ports: Pick<Ports, 'calls'>,
  userId: UserId,
  audioTok: Token | null,
  contentTok: Token | null,
): Promise<void> {
  if (audioTok !== null) {
    const id = await ports.calls.findIdByAudioTok(userId, audioTok);
    if (id) throw duplicate(id, 'audio');
  }
  if (contentTok !== null) {
    const id = await ports.calls.findIdByContentTok(userId, contentTok);
    if (id) throw duplicate(id, 'content');
  }
}

export async function createCall(
  ports: Ports,
  actor: Actor,
  input: CreateCallInput,
): Promise<{ id: CallId }> {
  const userId = actor.userId;
  if (!UUID.test(input.id)) throw new DomainError('invalid', 'call id must be a UUID');
  if (input.keywordToks.length > CALL_LIMITS.keywordToks) {
    throw new DomainError('invalid', 'too many keyword tokens');
  }
  if (input.tagToks.length > CALL_LIMITS.tagToks) {
    throw new DomainError('invalid', 'too many tag tokens');
  }
  if (input.wrappedDek.length === 0 || input.wrappedDek.length > CALL_LIMITS.wrappedDekBytes) {
    throw new DomainError('invalid', 'wrapped DEK has an invalid size');
  }
  validateChunks(input.chunks);

  await assertNotDuplicate(ports, userId, input.audioTok, input.contentTok);
  const [count, { maxCalls }] = await Promise.all([
    ports.calls.count(userId),
    limitsFor(ports, userId),
  ]);
  if (count >= maxCalls) {
    throw new DomainError('quota_exceeded', 'call limit reached', {
      limit: maxCalls,
      quota: 'calls',
    });
  }

  try {
    await ports.calls.create({
      id: input.id,
      userId,
      status: 'ready',
      source: input.source,
      day: input.day,
      durationBucket: input.durationBucket,
      wrappedDek: input.wrappedDek,
      transcriptCt: input.transcriptCt,
      metaCt: input.metaCt,
      contactTok: input.contactTok,
      keywordToks: [...new Set(input.keywordToks)],
      tagToks: [...new Set(input.tagToks)],
      audioTok: input.audioTok,
      contentTok: input.contentTok,
      recording: null,
    });
  } catch (e) {
    // Lost a race with a concurrent upload of the same call: report the winner's id.
    if (isDomainError(e) && e.code === 'duplicate') {
      const existing = e.details.existingId;
      if (typeof existing === 'string') throw duplicate(existing, 'content');
    }
    throw e;
  }
  if (input.chunks.length) {
    try {
      await ports.search.upsertChunks(userId, input.id, input.chunks.map(chunkRow));
    } catch (e) {
      await ports.calls.delete(userId, input.id);
      throw e;
    }
  }
  await audit(ports, actor, userId, 'call.create', input.id, { chunks: input.chunks.length });
  return { id: input.id };
}

const chunkRow = (c: NewChunkInput) => ({
  ord: c.ord,
  lang: c.lang ?? null,
  embedding: c.embedding,
  snippetCt: c.snippetCt,
});

export interface ReplaceCallContentInput {
  transcriptCt: Bytes;
  metaCt: Bytes;
  keywordToks: Token[];
  chunks: NewChunkInput[];
  /** The `updatedAt` the device read before re-indexing. */
  expectedUpdatedAt: Date;
}

/**
 * Re-index (translation backfill, synonym changes): the device re-derives everything from the
 * decrypted transcript and replaces it in one transaction. The content token stays, so
 * duplicate detection is unaffected; tags and the recording are untouched.
 */
export async function replaceCallContent(
  ports: Ports,
  actor: Actor,
  id: CallId,
  input: ReplaceCallContentInput,
): Promise<{ id: CallId; updatedAt: Date }> {
  const userId = actor.userId;
  if (input.keywordToks.length > CALL_LIMITS.keywordToks) {
    throw new DomainError('invalid', 'too many keyword tokens');
  }
  if (input.transcriptCt.length === 0 || input.metaCt.length === 0) {
    throw new DomainError('invalid', 'ciphertext is empty');
  }
  validateChunks(input.chunks);
  const updated = await ports.calls.replaceContent(
    userId,
    id,
    {
      transcriptCt: input.transcriptCt,
      metaCt: input.metaCt,
      keywordToks: [...new Set(input.keywordToks)],
      chunks: input.chunks.map(chunkRow),
    },
    input.expectedUpdatedAt,
  );
  await audit(ports, actor, userId, 'call.reindex', id, {
    chunks: input.chunks.length,
    keywords: updated.keywordToks.length,
  });
  return { id, updatedAt: updated.updatedAt };
}

export interface ListCallsInput {
  dayFrom?: Day;
  dayTo?: Day;
  /** All required (AND). */
  tagToks?: Token[];
  /** The user's `__star` tag token; when given, results report `starred` and `starred: true` filters. */
  starTok?: Token;
  starredOnly?: boolean;
  /** Duplicate lookup (ingest step 1 and 3): returns at most the one matching call. */
  audioTok?: Token;
  contentTok?: Token;
  cursor?: string | null;
  limit?: number;
}

export type CallListItem = CallSummary & { starred: boolean | null };

export async function listCalls(
  ports: Ports,
  actor: Actor,
  input: ListCallsInput,
): Promise<Page<CallListItem>> {
  const userId = actor.userId;
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > CALL_LIMITS.listPageMax) {
    throw new DomainError('invalid', 'limit must be 1..100');
  }
  if (input.starredOnly && input.starTok === undefined) {
    throw new DomainError('invalid', 'starred filter needs the star tag token');
  }
  const withStar = (s: CallSummary): CallListItem => ({
    ...s,
    starred: input.starTok === undefined ? null : s.tagToks.includes(input.starTok),
  });

  let page: Page<CallSummary>;
  if (input.audioTok !== undefined || input.contentTok !== undefined) {
    const id =
      (input.audioTok !== undefined
        ? await ports.calls.findIdByAudioTok(userId, input.audioTok)
        : null) ??
      (input.contentTok !== undefined
        ? await ports.calls.findIdByContentTok(userId, input.contentTok)
        : null);
    const call = id ? await ports.calls.get(userId, id) : null;
    page = { items: call ? [toSummary(call)] : [], nextCursor: null };
  } else {
    const tagToks = [...(input.tagToks ?? [])];
    if (input.starredOnly && input.starTok !== undefined) tagToks.push(input.starTok);
    page = await ports.calls.list(
      userId,
      {
        ...(input.dayFrom !== undefined && { dayFrom: input.dayFrom }),
        ...(input.dayTo !== undefined && { dayTo: input.dayTo }),
        ...(tagToks.length && { tagToks }),
      },
      { limit, cursor: input.cursor ?? null },
    );
  }
  await audit(ports, actor, userId, 'call.list', null, { count: page.items.length });
  return { items: page.items.map(withStar), nextCursor: page.nextCursor };
}

function toSummary(c: Call): CallSummary {
  return {
    id: c.id,
    day: c.day,
    durationBucket: c.durationBucket,
    wrappedDek: c.wrappedDek,
    metaCt: c.metaCt,
    tagToks: c.tagToks,
    hasRecording: c.recording !== null,
  };
}

/**
 * Full ciphertext of one call. Personal access tokens have an hourly fetch budget (spec 12):
 * each fetch counts, and fetches beyond it are refused until the window resets.
 */
export async function getCall(ports: Ports, actor: Actor, id: CallId): Promise<Call> {
  const userId = actor.userId;
  if (actor.kind === 'token') {
    const n = await ports.apiTokens.incrementFetches(userId, actor.tokenId, ports.clock.now());
    const { mcpFetchesPerTokenPerHour: limit } = await limitsFor(ports, userId);
    if (n > limit) {
      throw new DomainError('rate_limited', 'hourly fetch budget for this token is used up', {
        limit,
        retryAfterSec: HOUR_MS / 1000,
        quota: 'fetches',
      });
    }
  }
  const call = await ports.calls.get(userId, id);
  if (!call) throw new DomainError('not_found', 'call not found');
  await audit(ports, actor, userId, 'call.read', id);
  return call;
}

export interface RecordingInput {
  /** Null for the instance bucket; an id from the user's encrypted provider settings otherwise. */
  bucketRef: string | null;
  objectKey: string;
  bytes: number;
}

export interface UpdateCallInput {
  metaCt?: Bytes;
  tagToks?: Token[];
  recording?: RecordingInput | null;
}

const OWN_BUCKET_KEY = /^[A-Za-z0-9!_.*'()/-]{1,512}$/;

/** Bytes this call's recording occupies in the instance bucket. */
const instanceBytes = (c: Call) =>
  c.recording && c.recording.bucketRef === null ? c.recording.bytes : 0;

async function assertRecordingQuota(
  ports: Ports,
  userId: UserId,
  current: Call,
  addBytes: number,
): Promise<void> {
  const [total, { recordingBytes: limit }] = await Promise.all([
    ports.calls.totalRecordingBytes(userId),
    limitsFor(ports, userId),
  ]);
  if (total - instanceBytes(current) + addBytes > limit) {
    throw new DomainError('quota_exceeded', 'recording storage limit reached', {
      limit,
      quota: 'recording_bytes',
    });
  }
}

/** Removes a recording blob, or queues its deletion for the device when it is in an own bucket. */
async function dropRecording(
  ports: Ports,
  actor: Actor | 'system',
  userId: UserId,
  callId: CallId,
  rec: RecordingRef,
): Promise<void> {
  if (rec.bucketRef === null) {
    await ports.blobs.delete(rec.objectKey);
  } else {
    // The server holds no credentials for the user's bucket: the device deletes it at next
    // unlock by reading these events (spec 9, /api/cron/retention).
    await audit(ports, actor, userId, 'recording.orphaned', callId, {
      bucketRef: rec.bucketRef,
      objectKey: rec.objectKey,
    });
  }
}

export async function updateCall(
  ports: Ports,
  actor: Actor,
  id: CallId,
  input: UpdateCallInput,
): Promise<Call> {
  const userId = actor.userId;
  const current = await ports.calls.get(userId, id);
  if (!current) throw new DomainError('not_found', 'call not found');
  if (input.tagToks && input.tagToks.length > CALL_LIMITS.tagToks) {
    throw new DomainError('invalid', 'too many tag tokens');
  }

  let recording: RecordingRef | null | undefined;
  if (input.recording === null) {
    recording = null;
  } else if (input.recording) {
    const r = input.recording;
    if (!Number.isSafeInteger(r.bytes) || r.bytes <= 0) {
      throw new DomainError('invalid', 'recording bytes must be positive');
    }
    if (r.bucketRef === null) {
      const prefix = `${blobKeys.recordingPrefix(userId)}${id}/`;
      if (!r.objectKey.startsWith(prefix) || r.objectKey.includes('..')) {
        throw new DomainError('invalid', 'recording key does not belong to this call');
      }
      const size = await ports.blobs.size(r.objectKey);
      if (size === null) throw new DomainError('invalid', 'recording was not uploaded');
      if (size !== r.bytes) throw new DomainError('invalid', 'recording size does not match');
      await assertRecordingQuota(ports, userId, current, r.bytes);
    } else if (!OWN_BUCKET_KEY.test(r.objectKey) || r.bucketRef.length > 128) {
      throw new DomainError('invalid', 'invalid own-bucket reference');
    }
    recording = { bucketRef: r.bucketRef, objectKey: r.objectKey, bytes: r.bytes };
  }

  const updated = await ports.calls.update(userId, id, {
    ...(input.metaCt && { metaCt: input.metaCt }),
    ...(input.tagToks && { tagToks: [...new Set(input.tagToks)] }),
    ...(recording !== undefined && { recording }),
  });
  const old = current.recording;
  if (
    recording !== undefined &&
    old &&
    !(recording && recording.bucketRef === old.bucketRef && recording.objectKey === old.objectKey)
  ) {
    await dropRecording(ports, actor, userId, id, old);
  }
  await audit(ports, actor, userId, 'call.update', id, {
    meta: input.metaCt !== undefined,
    tags: input.tagToks !== undefined,
    recording: recording === undefined ? 'unchanged' : recording ? 'set' : 'removed',
  });
  return updated;
}

/** Deletes the row, its chunks and its recording blob. Shared by DELETE and retention. */
export async function deleteCallFor(
  ports: Ports,
  actor: Actor | 'system',
  userId: UserId,
  id: CallId,
): Promise<boolean> {
  const call = await ports.calls.get(userId, id);
  if (!call) return false;
  await ports.search.deleteChunks(userId, id);
  const deleted = await ports.calls.delete(userId, id);
  if (!deleted) return false;
  if (deleted.recording) await dropRecording(ports, actor, userId, id, deleted.recording);
  return true;
}

export async function deleteCall(ports: Ports, actor: Actor, id: CallId): Promise<void> {
  if (!(await deleteCallFor(ports, actor, actor.userId, id))) {
    throw new DomainError('not_found', 'call not found');
  }
  await audit(ports, actor, actor.userId, 'call.delete', id);
}

export interface PresignedUpload {
  objectKey: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
}

/** Presigned PUT for an encrypted recording, checked against the 2 GB storage quota. */
export async function presignRecordingUpload(
  ports: Ports,
  actor: Actor,
  id: CallId,
  input: { bytes: number; contentType?: string },
): Promise<PresignedUpload> {
  const userId = actor.userId;
  if (!Number.isSafeInteger(input.bytes) || input.bytes <= 0) {
    throw new DomainError('invalid', 'recording bytes must be positive');
  }
  const call = await ports.calls.get(userId, id);
  if (!call) throw new DomainError('not_found', 'call not found');
  await assertRecordingQuota(ports, userId, call, input.bytes);
  const objectKey = blobKeys.recording(userId, id, ports.ids.randomId());
  const req = await ports.blobs.presignPut(objectKey, {
    expiresInSec: CALL_LIMITS.presignSec,
    contentLength: input.bytes,
    contentType: input.contentType ?? 'application/octet-stream',
  });
  await audit(ports, actor, userId, 'recording.upload', id, { bytes: input.bytes });
  return { objectKey, url: req.url, method: 'PUT', headers: req.headers, expiresAt: req.expiresAt };
}

export type RecordingDownload =
  | {
      location: 'instance';
      url: string;
      headers: Record<string, string>;
      expiresAt: Date;
      bytes: number;
    }
  | { location: 'own_bucket'; bucketRef: string; objectKey: string; bytes: number };

export async function presignRecordingDownload(
  ports: Ports,
  actor: Actor,
  id: CallId,
): Promise<RecordingDownload> {
  const userId = actor.userId;
  const call = await ports.calls.get(userId, id);
  if (!call) throw new DomainError('not_found', 'call not found');
  const rec = call.recording;
  if (!rec) throw new DomainError('not_found', 'call has no recording');
  await audit(ports, actor, userId, 'recording.read', id);
  if (rec.bucketRef !== null) {
    return {
      location: 'own_bucket',
      bucketRef: rec.bucketRef,
      objectKey: rec.objectKey,
      bytes: rec.bytes,
    };
  }
  const req = await ports.blobs.presignGet(rec.objectKey, { expiresInSec: CALL_LIMITS.presignSec });
  return {
    location: 'instance',
    url: req.url,
    headers: req.headers,
    expiresAt: req.expiresAt,
    bytes: rec.bytes,
  };
}
