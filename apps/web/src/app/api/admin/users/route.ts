import { listAccounts, promoteToAdmin } from '@askcalls/api-contract/routes/admin';
import { DomainError } from '@askcalls/domain';
import { listAccounts as list, promoteUser } from '@askcalls/domain/use-cases/admin';
import { route } from '../../../../server/http/handler';

export const GET = route(
  listAccounts,
  ({ ports, actor, query }) =>
    list(ports, actor, {
      ...(query.email !== undefined && { email: query.email }),
      ...(query.cursor !== undefined && { cursor: query.cursor }),
      ...(query.limit !== undefined && { limit: query.limit }),
    }),
  { rateLimit: { name: 'admin-accounts', limit: 60, windowMs: 60_000 } },
);

export const POST = route(
  promoteToAdmin,
  ({ ports, actor, body, container }) => {
    if (container.config.config.auth.adminEmails.length) {
      throw new DomainError('forbidden', 'admins are set by ADMIN_EMAILS');
    }
    return promoteUser(ports, actor, body.email);
  },
  { rateLimit: { name: 'admin-promote', limit: 20, windowMs: 60_000 } },
);
