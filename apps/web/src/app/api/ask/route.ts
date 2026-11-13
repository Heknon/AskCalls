import { ask } from '@askcalls/api-contract/routes/providers';
import { askAboutCall } from '@askcalls/domain/use-cases/providers';
import { route, streamText } from '../../../server/http/handler';

/** Streams the LLM answer for one decrypted call. Never stored, never logged. */
export const POST = route(
  ask,
  async ({ ports, actor, body, req }) =>
    streamText(await askAboutCall(ports, actor, { ...body, signal: req.signal })),
  { rateLimit: { name: 'ask', limit: 20, windowMs: 60_000 }, maxBodyBytes: 4 * 1024 * 1024 },
);
