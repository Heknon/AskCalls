import { connectStorage } from '@askcalls/api-contract/routes/storage';
import { DomainError } from '@askcalls/domain';
import { authSecret } from '../../../../../server/auth/secret';
import { route } from '../../../../../server/http/handler';
import {
  authorizationUrl,
  FLOW_TTL_MS,
  flowCookieHeader,
  googleStorageClient,
  pkceChallenge,
  randomToken,
  signFlow,
} from '../../../../../server/storage/google';

/** Opens in the Settings popup: state and PKCE go into a signed cookie, then on to Google. */
export const GET = route(
  connectStorage,
  async ({ req, container, ports, actor, query }) => {
    const client = googleStorageClient(container.config);
    const secret = authSecret(container.config);
    if (!client || !secret) throw new DomainError('unsupported', 'Google Drive is not set up');
    const verifier = randomToken(48);
    const state = randomToken();
    const signed = await signFlow(secret, actor.userId, {
      state,
      verifier,
      ticket: query.ticket,
      expiresAt: ports.clock.now().getTime() + FLOW_TTL_MS,
    });
    const secure = new URL(req.url).protocol === 'https:';
    return new Response(null, {
      status: 302,
      headers: {
        Location: authorizationUrl(client, state, await pkceChallenge(verifier)),
        'Set-Cookie': flowCookieHeader(signed, secure),
        'Referrer-Policy': 'no-referrer',
      },
    });
  },
  { rateLimit: { name: 'storage-connect', limit: 10, windowMs: 60_000 } },
);
