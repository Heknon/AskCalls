import { z } from 'zod';
import { defineRoute } from '../route';
import { BytesCodec, BytesMax, DateCodec, QInt } from '../wire';

/** Encrypted vocabulary deltas (spec 7.12). */
const VocabDeltaSchema = z.object({
  id: z.string(),
  seq: z.number().int(),
  ct: BytesCodec,
  compacted: z.boolean(),
  createdAt: DateCodec,
});

export const listVocab = defineRoute({
  method: 'GET',
  path: '/api/vocab',
  auth: 'read',
  query: z.object({ since: QInt.optional() }),
  response: z.object({
    deltas: z.array(VocabDeltaSchema),
    count: z.number().int(),
    /** Compact when `count` exceeds this. */
    compactAfter: z.number().int(),
  }),
});

export const writeVocab = defineRoute({
  method: 'POST',
  path: '/api/vocab',
  auth: 'write',
  body: z.discriminatedUnion('op', [
    z.object({ op: z.literal('append'), ct: BytesMax(1024 * 1024) }),
    z.object({
      op: z.literal('compact'),
      upToSeq: z.number().int().min(1),
      ct: BytesMax(3 * 1024 * 1024),
    }),
  ]),
  response: VocabDeltaSchema,
});
