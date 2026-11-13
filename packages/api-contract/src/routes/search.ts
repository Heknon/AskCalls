import { z } from 'zod';
import { defineRoute } from '../route';
import { BytesCodec, DayInt, DurationBucketSchema, EmbeddingCodec, TokCodec } from '../wire';

/** Spec 9.1. */
export const SearchBody = z.object({
  /** AND across groups, OR within a group (one term's fuzzy variants). */
  keywordGroups: z.array(z.array(TokCodec).min(1).max(128)).max(32),
  contactToks: z.array(TokCodec).max(256).optional(),
  tagToks: z.array(TokCodec).max(64).optional(),
  excludeTagToks: z.array(TokCodec).max(64).optional(),
  dayFrom: DayInt.optional(),
  dayTo: DayInt.optional(),
  /** Query embedding (e5 `query: ` prefix), 384 dimensions. */
  vector: EmbeddingCodec.optional(),
  limit: z.number().int().min(1).max(50),
  cursor: z.string().max(512).nullable().optional(),
  /** The user's `__star` tag token, so hits report `starred`. */
  starTok: TokCodec.optional(),
});

export const SearchHitSchema = z.object({
  id: z.string(),
  day: DayInt,
  durationBucket: DurationBucketSchema,
  wrappedDek: BytesCodec,
  metaCt: BytesCodec,
  tagToks: z.array(TokCodec),
  hasRecording: z.boolean(),
  starred: z.boolean().nullable(),
  bestSnippetCt: BytesCodec.nullable(),
  bestChunkOrd: z.number().int().nullable(),
  /** Language of the best chunk; null for chunks stored before translations. */
  bestChunkLang: z.string().nullable(),
  score: z.number().nullable(),
});

export const search = defineRoute({
  method: 'POST',
  path: '/api/search',
  auth: 'read',
  body: SearchBody,
  response: z.object({ items: z.array(SearchHitSchema), nextCursor: z.string().nullable() }),
});
