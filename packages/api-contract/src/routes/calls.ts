import { z } from 'zod';
import { defineRoute } from '../route';
import {
  BytesCodec,
  BytesMax,
  DateCodec,
  DayInt,
  DurationBucketSchema,
  EmbeddingCodec,
  QBool,
  QDay,
  QInt,
  QTokList,
  TokCodec,
} from '../wire';

const CallIdParam = z.object({ id: z.string().min(1).max(64) });

export const ChunkIn = z.object({
  /** Unique across languages: the original's chunks, then each translation's. */
  ord: z.number().int().min(0).max(100_000),
  /** ISO 639-1 of the chunk's text. Optional for clients that predate translations. */
  lang: z
    .string()
    .regex(/^[a-z]{2}$/)
    .nullable()
    .optional(),
  embedding: EmbeddingCodec,
  snippetCt: BytesMax(4_096),
});

export const CreateCallBody = z.object({
  /** Client-chosen UUIDv7 (the AAD of every ciphertext binds it). */
  id: z.uuid(),
  source: z.enum(['app', 'agent', 'inbox']),
  day: DayInt,
  durationBucket: DurationBucketSchema,
  wrappedDek: BytesMax(256),
  transcriptCt: BytesMax(3 * 1024 * 1024),
  metaCt: BytesMax(64 * 1024),
  contactTok: TokCodec.nullable(),
  keywordToks: z.array(TokCodec).max(25_000),
  tagToks: z.array(TokCodec).max(256),
  audioTok: TokCodec.nullable(),
  contentTok: TokCodec,
  chunks: z.array(ChunkIn).max(2_000),
});

/** 409 `duplicate` responses carry `details.existingId` and `details.match` (audio|content). */
export const createCall = defineRoute({
  method: 'POST',
  path: '/api/calls',
  auth: 'write',
  body: CreateCallBody,
  response: z.object({ id: z.string() }),
});

export const CallListItem = z.object({
  id: z.string(),
  day: DayInt,
  durationBucket: DurationBucketSchema,
  wrappedDek: BytesCodec,
  metaCt: BytesCodec,
  tagToks: z.array(TokCodec),
  hasRecording: z.boolean(),
  /** Null unless the request carried `star_tok`. */
  starred: z.boolean().nullable(),
});

/**
 * Lists metadata ciphertext. `star_tok` is the user's `__star` tag token (computed on the
 * device); `starred=true` filters by it. `audio_tok` / `content_tok` look up a duplicate.
 */
export const listCalls = defineRoute({
  method: 'GET',
  path: '/api/calls',
  auth: 'read',
  query: z.object({
    cursor: z.string().max(512).optional(),
    limit: QInt.pipe(z.number().int().min(1).max(100)).optional(),
    day_from: QDay.optional(),
    day_to: QDay.optional(),
    tag: QTokList.optional(),
    star_tok: TokCodec.optional(),
    starred: QBool.optional(),
    audio_tok: TokCodec.optional(),
    content_tok: TokCodec.optional(),
  }),
  response: z.object({ items: z.array(CallListItem), nextCursor: z.string().nullable() }),
});

export const RecordingRefSchema = z.object({
  bucketRef: z.string().max(128).nullable(),
  objectKey: z.string().max(512),
  bytes: z.number().int().positive(),
});

export const CallFull = z.object({
  id: z.string(),
  status: z.enum(['ready', 'pending_inbox', 'failed']),
  source: z.enum(['app', 'agent', 'inbox']),
  day: DayInt,
  durationBucket: DurationBucketSchema,
  wrappedDek: BytesCodec,
  transcriptCt: BytesCodec,
  metaCt: BytesCodec,
  contactTok: TokCodec.nullable(),
  tagToks: z.array(TokCodec),
  audioTok: TokCodec.nullable(),
  contentTok: TokCodec,
  recording: RecordingRefSchema.nullable(),
  createdAt: DateCodec,
  updatedAt: DateCodec,
});

/** Full ciphertext of one call. With a token it counts toward the hourly fetch budget. */
export const getCall = defineRoute({
  method: 'GET',
  path: '/api/calls/:id',
  auth: 'read',
  params: CallIdParam,
  response: CallFull,
});

export const updateCall = defineRoute({
  method: 'PATCH',
  path: '/api/calls/:id',
  auth: 'write',
  params: CallIdParam,
  body: z
    .object({
      metaCt: BytesMax(64 * 1024).optional(),
      tagToks: z.array(TokCodec).max(256).optional(),
      /** Confirms an upload (`recording-upload`), points at an own bucket, or removes (null). */
      recording: RecordingRefSchema.nullable().optional(),
    })
    .refine(
      (b) => b.metaCt !== undefined || b.tagToks !== undefined || b.recording !== undefined,
      'nothing to update',
    ),
  response: CallFull,
});

export const deleteCall = defineRoute({
  method: 'DELETE',
  path: '/api/calls/:id',
  auth: 'write',
  params: CallIdParam,
  response: z.object({ deleted: z.literal(true) }),
});

export const recordingUpload = defineRoute({
  method: 'POST',
  path: '/api/calls/:id/recording-upload',
  auth: 'write',
  params: CallIdParam,
  body: z.object({
    bytes: z.number().int().positive(),
    contentType: z.string().max(100).optional(),
  }),
  response: z.object({
    objectKey: z.string(),
    url: z.string(),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
    expiresAt: DateCodec,
  }),
});

export const recordingDownload = defineRoute({
  method: 'GET',
  path: '/api/calls/:id/recording',
  auth: 'read',
  params: CallIdParam,
  response: z.discriminatedUnion('location', [
    z.object({
      location: z.literal('instance'),
      url: z.string(),
      headers: z.record(z.string(), z.string()),
      expiresAt: DateCodec,
      bytes: z.number().int(),
    }),
    z.object({
      location: z.literal('own_bucket'),
      bucketRef: z.string(),
      objectKey: z.string(),
      bytes: z.number().int(),
    }),
  ]),
});
