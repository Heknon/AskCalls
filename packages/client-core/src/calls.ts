import {
  deleteCall as deleteCallRoute,
  getCall as getCallRoute,
  listCalls as listCallsRoute,
  recordingDownload,
  updateCall,
} from '@askcalls/api-contract/routes/calls';
import {
  type ByteSource,
  decryptRecordingStream,
  fromBase64Url,
  verifyCall,
} from '@askcalls/crypto';
import {
  type CallMeta,
  type CallSource,
  DomainError,
  type DurationBucket,
  dateFromDay,
  dayFromDate,
  type Transcript,
} from '@askcalls/domain';
import {
  analyzeCall,
  DEFAULT_PHONE_REGION,
  isPhoneRegion,
  negateVocabulary,
} from '@askcalls/indexing';
import { toSrt, toTxt } from '@askcalls/transcript-formats';
import { decryptMeta, decryptTranscript, encryptMeta, openDek, recordingAad } from './call-crypto';
import type { ClientContext } from './context';
import { type ResolvedTag, STAR_TAG_ID, tagTokens } from './tags';

export interface CallFilter {
  starred?: boolean;
  /** Catalog tag ids (or `intent:<id>`), all required. */
  tagIds?: readonly string[];
  dateFrom?: Date;
  dateTo?: Date;
  cursor?: string | null;
  limit?: number;
}

/** A calls-list row. Metadata decrypts lazily, once, when the row is rendered. */
export interface CallRow {
  id: string;
  day: number;
  durationBucket: DurationBucket;
  tags: ResolvedTag[];
  tagToks: readonly bigint[];
  starred: boolean;
  hasRecording: boolean;
  meta(): Promise<CallMeta>;
}

export async function listCalls(
  ctx: ClientContext,
  filter: CallFilter = {},
): Promise<{ items: CallRow[]; nextCursor: string | null }> {
  const { session } = ctx;
  const directory = await ctx.tagDirectory();
  const starTok = directory.tokenOf(STAR_TAG_ID)!;
  const tag = filter.tagIds?.length ? await tagTokens(session, filter.tagIds) : undefined;
  const res = await ctx.api.request(listCallsRoute, {
    query: {
      star_tok: starTok,
      ...(filter.starred && { starred: true }),
      ...(tag && { tag }),
      ...(filter.dateFrom && { day_from: dayFromDate(filter.dateFrom) }),
      ...(filter.dateTo && { day_to: dayFromDate(filter.dateTo) }),
      ...(filter.cursor && { cursor: filter.cursor }),
      ...(filter.limit && { limit: filter.limit }),
    },
  });
  const items = res.items.map((item): CallRow => {
    let meta: Promise<CallMeta> | null = null;
    return {
      id: item.id,
      day: item.day,
      durationBucket: item.durationBucket,
      tags: directory.resolve(item.tagToks),
      tagToks: item.tagToks,
      starred: item.starred ?? directory.isStarred(item.tagToks),
      hasRecording: item.hasRecording,
      meta: () => {
        meta ??= openDek(session, item.id, item.wrappedDek).then((dek) =>
          decryptMeta(dek, { userId: session.userId, callId: item.id }, item.metaCt),
        );
        return meta;
      },
    };
  });
  return { items, nextCursor: res.nextCursor };
}

export type SignatureStatus =
  | { status: 'valid'; deviceKeyId: string; deviceLabel: string; deviceRevoked: boolean }
  | { status: 'invalid'; deviceKeyId: string }
  | { status: 'unknown_device'; deviceKeyId: string }
  | { status: 'unsigned' };

export interface DecryptedCall {
  id: string;
  source: CallSource;
  day: number;
  durationBucket: DurationBucket;
  meta: CallMeta;
  transcript: Transcript;
  tags: ResolvedTag[];
  tagToks: readonly bigint[];
  starred: boolean;
  signature: SignatureStatus;
  recording: { bucketRef: string | null; objectKey: string; bytes: number } | null;
  /** Bound into the signature; a re-index keeps it. */
  contentTok: bigint;
  createdAt: Date;
  updatedAt: Date;
  /** Kept for later updates (notes, title); dropped with the call object. */
  dek: CryptoKey;
}

async function verifySignature(
  ctx: ClientContext,
  callId: string,
  contentTok: bigint,
  plaintext: Uint8Array,
  meta: CallMeta,
): Promise<SignatureStatus> {
  if (!meta.signature) return { status: 'unsigned' };
  const { deviceKeyId } = meta.signature;
  const device =
    (await ctx.devices()).get(deviceKeyId) ??
    (await ctx.devices({ refresh: true })).get(deviceKeyId);
  if (!device) return { status: 'unknown_device', deviceKeyId };
  const ok = await verifyCall(
    device.signingPublicKey,
    { callId, contentTok, transcriptPlaintext: plaintext },
    fromBase64Url(meta.signature.signature),
  ).catch(() => false);
  return ok
    ? { status: 'valid', deviceKeyId, deviceLabel: device.label, deviceRevoked: device.revoked }
    : { status: 'invalid', deviceKeyId };
}

/** Fetches one call, decrypts transcript and metadata and verifies its signature (spec 6.6). */
export async function getCall(ctx: ClientContext, id: string): Promise<DecryptedCall> {
  const { session } = ctx;
  const [call, directory] = await Promise.all([
    ctx.api.request(getCallRoute, { params: { id } }),
    ctx.tagDirectory(),
  ]);
  const keyCtx = { userId: session.userId, callId: call.id };
  const dek = await openDek(session, call.id, call.wrappedDek);
  const [{ transcript, plaintext }, meta] = await Promise.all([
    decryptTranscript(dek, keyCtx, call.transcriptCt),
    decryptMeta(dek, keyCtx, call.metaCt),
  ]);
  const signature = await verifySignature(ctx, call.id, call.contentTok, plaintext, meta);
  plaintext.fill(0);
  session.touch();
  return {
    id: call.id,
    source: call.source,
    day: call.day,
    durationBucket: call.durationBucket,
    meta,
    transcript,
    tags: directory.resolve(call.tagToks),
    tagToks: call.tagToks,
    starred: directory.isStarred(call.tagToks),
    signature,
    recording: call.recording,
    contentTok: call.contentTok,
    createdAt: call.createdAt,
    updatedAt: call.updatedAt,
    dek,
  };
}

/** Re-encrypts metadata with the call's DEK after editing notes or title. */
export async function updateCallMeta(
  ctx: ClientContext,
  call: Pick<DecryptedCall, 'id' | 'dek' | 'meta'>,
  patch: Partial<Pick<CallMeta, 'notes' | 'title' | 'contactName'>>,
): Promise<CallMeta> {
  const meta = { ...call.meta, ...patch };
  const metaCt = await encryptMeta(call.dek, { userId: ctx.session.userId, callId: call.id }, meta);
  await ctx.api.request(updateCall, { params: { id: call.id }, body: { metaCt } });
  return meta;
}

/**
 * Adds and removes tags (catalog ids, `intent:<id>` or `__star`). `current` is the call's
 * `tagToks`; tokens that resolve to no known tag are kept.
 */
export async function updateCallTags(
  ctx: ClientContext,
  call: { id: string; tagToks: readonly bigint[] },
  change: { add?: readonly string[]; remove?: readonly string[] },
): Promise<bigint[]> {
  const [add, remove] = await Promise.all([
    tagTokens(ctx.session, change.add ?? []),
    tagTokens(ctx.session, change.remove ?? []),
  ]);
  const next = [...new Set([...call.tagToks.filter((t) => !remove.includes(t)), ...add])].sort(
    (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  );
  await ctx.api.request(updateCall, { params: { id: call.id }, body: { tagToks: next } });
  return next;
}

export const starCall = (
  ctx: ClientContext,
  call: { id: string; tagToks: readonly bigint[] },
  starred: boolean,
) => updateCallTags(ctx, call, starred ? { add: [STAR_TAG_ID] } : { remove: [STAR_TAG_ID] });

/**
 * Deletes a call. When the decrypted call is given, its keyword counts are subtracted from the
 * vocabulary so fuzzy search stops suggesting forms that only it held.
 */
export async function deleteCall(
  ctx: ClientContext,
  id: string,
  decrypted?: Pick<DecryptedCall, 'transcript' | 'meta'>,
): Promise<void> {
  await ctx.api.request(deleteCallRoute, { params: { id } });
  if (!decrypted) return;
  const [settings, synonyms] = await Promise.all([
    ctx.userData.get('settings'),
    ctx.userData.get('synonyms'),
  ]);
  const analyzed = analyzeCall({
    transcript: decrypted.transcript,
    meta: { phone: decrypted.meta.phoneE164 },
    synonyms: synonyms.entries,
    region: isPhoneRegion(settings.phoneRegion) ? settings.phoneRegion : DEFAULT_PHONE_REGION,
  });
  await ctx.vocabulary.append(negateVocabulary(analyzed.vocabularyDelta));
}

export interface TranscriptFile {
  fileName: string;
  mimeType: string;
  content: string;
}

/** Named by the local date the call started, else by its UTC day. */
function baseFileName(call: Pick<DecryptedCall, 'id' | 'day' | 'meta'>): string {
  const at = call.meta.startedAt ? new Date(call.meta.startedAt) : null;
  const date = at
    ? new Date(at.getTime() - at.getTimezoneOffset() * 60_000)
    : dateFromDay(call.day);
  return `call-${date.toISOString().slice(0, 10)}-${call.id.slice(-12)}`;
}

/** TXT or SRT, generated on the device (spec 11.2). */
export function transcriptFile(
  call: Pick<DecryptedCall, 'id' | 'day' | 'meta' | 'transcript'>,
  format: 'txt' | 'srt',
): TranscriptFile {
  return format === 'srt'
    ? {
        fileName: `${baseFileName(call)}.srt`,
        mimeType: 'application/x-subrip',
        content: toSrt(call.transcript),
      }
    : {
        fileName: `${baseFileName(call)}.txt`,
        mimeType: 'text/plain;charset=utf-8',
        content: toTxt(call.transcript),
      };
}

/**
 * Streams the decrypted recording. Plaintext is unverified until the iterator completes
 * without throwing (truncation and tampering fail at the end).
 */
export async function openRecording(
  ctx: ClientContext,
  call: Pick<DecryptedCall, 'id' | 'dek'>,
): Promise<AsyncGenerator<Uint8Array>> {
  const res = await ctx.api.request(recordingDownload, { params: { id: call.id } });
  let source: ByteSource;
  if (res.location === 'instance') {
    if (!ctx.fetcher) throw new DomainError('unsupported', 'no blob fetcher on this device');
    source = [await ctx.fetcher.get({ url: res.url, headers: res.headers })];
  } else {
    if (!ctx.ownStores) throw new DomainError('unsupported', 'no own-store adapter');
    source = ctx.ownStores.get(res.bucketRef, res.objectKey);
  }
  return decryptRecordingStream(
    call.dek,
    source,
    recordingAad({ userId: ctx.session.userId, callId: call.id }),
  );
}

/** Collects a recording into memory (export, Blob URL for the player). */
export async function readRecording(
  ctx: ClientContext,
  call: Pick<DecryptedCall, 'id' | 'dek'>,
): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const p of await openRecording(ctx, call)) parts.push(p);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
