import { z } from 'zod';
import { defineRoute } from '../route';
import { BytesMax, DateCodec, TokCodec } from '../wire';
import { ChunkIn } from './calls';

const CallIdParam = z.object({ id: z.string().min(1).max(64) });

/**
 * Re-index one call: the device replaces everything it derives from the transcript (the
 * transcript and metadata ciphertext with a new signature, keyword tokens, chunks) in one
 * step. The content token, tags and recording stay. `expectedUpdatedAt` is the call's
 * `updatedAt` as the device read it: 409 `version_conflict` when it changed since.
 */
export const replaceCallContent = defineRoute({
  method: 'PUT',
  path: '/api/calls/:id/content',
  auth: 'write',
  params: CallIdParam,
  body: z.object({
    transcriptCt: BytesMax(3 * 1024 * 1024),
    metaCt: BytesMax(64 * 1024),
    keywordToks: z.array(TokCodec).max(25_000),
    chunks: z.array(ChunkIn).max(2_000),
    expectedUpdatedAt: DateCodec,
  }),
  response: z.object({ id: z.string(), updatedAt: DateCodec }),
});
