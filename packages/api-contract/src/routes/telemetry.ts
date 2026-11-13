import { z } from 'zod';
import { defineRoute } from '../route';

/**
 * Product events the browser reports (spec 11.3a): typed and content-free. The server drops
 * them unless the account opted in to product analytics.
 */
export const ClientEvent = z.discriminatedUnion('name', [
  z.object({
    name: z.literal('onboarding_step'),
    step: z.enum(['welcome', 'passkey', 'recovery', 'try', 'ai']),
  }),
  z.object({ name: z.literal('first_search_with_result') }),
]);
export type ClientEvent = z.infer<typeof ClientEvent>;

export const reportEvent = defineRoute({
  method: 'POST',
  path: '/api/telemetry/events',
  auth: 'session',
  body: ClientEvent,
  response: z.object({}),
});

/**
 * A browser error (spec 11.3a), dropped unless the account opted in to error reports. The
 * scrubber keeps the class name and `file:line:col` frames only.
 */
export const reportError = defineRoute({
  method: 'POST',
  path: '/api/telemetry/errors',
  auth: 'session',
  body: z.object({
    errorName: z.string().max(64).optional(),
    stack: z.string().max(8_000).optional(),
  }),
  response: z.object({}),
});
