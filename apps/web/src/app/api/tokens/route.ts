import { createToken, listTokens, revokeToken } from '@askcalls/api-contract/routes/tokens';
import { createApiToken, listApiTokens, revokeApiToken } from '@askcalls/domain/use-cases/tokens';
import { route } from '../../../server/http/handler';

export const GET = route(listTokens, async ({ ports, actor }) => ({
  items: await listApiTokens(ports, actor),
}));

/** The token string is in this response only; the server keeps its sha256. */
export const POST = route(
  createToken,
  ({ ports, actor, body }) => createApiToken(ports, actor, body),
  {
    rateLimit: { name: 'token-create', limit: 10, windowMs: 600_000 },
  },
);

export const DELETE = route(revokeToken, async ({ ports, actor, query }) => {
  await revokeApiToken(ports, actor, query.id);
  return { revoked: true as const };
});
