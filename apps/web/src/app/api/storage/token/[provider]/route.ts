import { storageToken } from '@askcalls/api-contract/routes/storage';
import { DomainError } from '@askcalls/domain';
import { audit } from '@askcalls/domain/use-cases/context';
import { route } from '../../../../../server/http/handler';
import { guardedFetch } from '../../../../../server/http/offline-fetch';
import {
  googleStorageClient,
  refreshAccessToken,
  revokeToken,
} from '../../../../../server/storage/google';

/**
 * Stateless pass-through (spec 11.2a): the device's refresh token in, an access token out, or
 * the grant revoked. The client secret never leaves the server; the tokens are never stored or
 * logged, and the response is `no-store` like every API route.
 */
export const POST = route(
  storageToken,
  async ({ container, ports, actor, body }) => {
    const client = googleStorageClient(container.config);
    if (!client) throw new DomainError('unsupported', 'Google Drive is not set up');
    const fetchImpl = guardedFetch(container.config.config.offlineMode);
    if (body.action === 'revoke') {
      await revokeToken(fetchImpl, client, body.refreshToken);
      await audit(ports, actor, actor.userId, 'storage.unlink', null, { provider: 'google' });
      return { action: 'revoke' as const, revoked: true as const };
    }
    const t = await refreshAccessToken(fetchImpl, client, body.refreshToken);
    return { action: 'refresh' as const, ...t };
  },
  { rateLimit: { name: 'storage-token', limit: 120, windowMs: 60_000 } },
);
