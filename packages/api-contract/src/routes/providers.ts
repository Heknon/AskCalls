import { z } from 'zod';
import { defineRoute } from '../route';
import { DateCodec } from '../wire';

/**
 * Plaintext pass-through routes (spec 2.2). Bodies stream to the provider and are never
 * stored or logged.
 */

/** Language hint: `auto` or a BCP-47 code. */
export const LanguageHint = z
  .string()
  .regex(/^(auto|[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)$/)
  .default('auto');

const TranscribeUsage = z.object({ usedSeconds: z.number(), limitSeconds: z.number() });

/**
 * Body: one raw audio chunk (≤ 4 MB) with its audio Content-Type. Query: `language`.
 * 403 `quota_exceeded` when the monthly minutes are used up.
 */
export const transcribe = defineRoute({
  method: 'POST',
  path: '/api/transcribe',
  auth: 'write',
  query: z.object({ language: LanguageHint.optional() }),
  rawBody: {
    contentTypes: [
      'audio/ogg',
      'audio/webm',
      'audio/mpeg',
      'audio/mp4',
      'audio/wav',
      'audio/x-wav',
      'audio/flac',
      'audio/aac',
      'audio/x-m4a',
      'application/octet-stream',
    ],
    maxBytes: 4 * 1024 * 1024,
  },
  response: z.object({
    segments: z.array(
      z.object({
        start: z.number(),
        end: z.number(),
        speaker: z.string().optional(),
        text: z.string(),
      }),
    ),
    language: z.string().nullable(),
    durationSec: z.number().nullable(),
    usage: TranscribeUsage,
  }),
});

/** Direct mode: a single-use provider token. The declared duration is charged up front. */
export const transcribeToken = defineRoute({
  method: 'POST',
  path: '/api/transcribe/token',
  auth: 'write',
  body: z.object({ durationSec: z.number().positive().max(14_400) }),
  response: z.object({
    token: z.string(),
    endpoint: z.string(),
    expiresAt: DateCodec,
    usage: TranscribeUsage,
  }),
});

/** Streams the answer as `text/plain; charset=utf-8`. 404 `unsupported` when ask is off. */
export const ask = defineRoute({
  method: 'POST',
  path: '/api/ask',
  auth: 'ask',
  body: z.object({
    question: z.string().min(1).max(4_000),
    transcriptText: z.string().min(1).max(1_000_000),
    history: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(20_000) }))
      .max(20)
      .optional(),
    consent: z.literal(true),
  }),
  stream: true,
});
