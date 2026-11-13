import { translate } from '@askcalls/api-contract/routes/providers';
import { translateSegments } from '@askcalls/domain/use-cases/providers';
import { route } from '../../../server/http/handler';

/** Translates one batch of a decrypted call's segments. Never stored, never logged. */
export const POST = route(
  translate,
  ({ ports, actor, body, req }) =>
    translateSegments(ports, actor, {
      segments: body.segments,
      source: body.source,
      target: body.target,
      signal: req.signal,
    }),
  { rateLimit: { name: 'translate', limit: 60, windowMs: 60_000 }, maxBodyBytes: 512 * 1024 },
);
