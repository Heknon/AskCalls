import { z } from 'zod';
import { defineRoute } from '../route';

/** Plaintext pass-through like `ask` (spec 2.2): streamed to the LLM, never stored or logged. */

/**
 * Translation at ingest: one batch of a call's segments (≤ 200, ≤ 24,000 characters) into one
 * ISO 639-1 language, as the user's translation rules ask, aligned segment for segment. In transit only, like `ask`. 404 `unsupported` when
 * translation or the LLM is off; 403 `quota_exceeded` when the month's characters are used up.
 */
export const translate = defineRoute({
  method: 'POST',
  path: '/api/translate',
  auth: 'write',
  body: z.object({
    segments: z.array(z.string().max(4_000)).min(1).max(200),
    source: z
      .string()
      .regex(/^[a-z]{2}$/)
      .nullable(),
    target: z.string().regex(/^[a-z]{2}$/),
  }),
  response: z.object({
    segments: z.array(z.string()),
    provider: z.string(),
    model: z.string(),
    usage: z.object({ usedChars: z.number(), limitChars: z.number() }),
  }),
});
