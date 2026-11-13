import { promoteToAdmin } from '@askcalls/api-contract/routes/admin';
import { DomainError } from '@askcalls/domain';
import { promoteUser } from '@askcalls/domain/use-cases/admin';
import { route } from '../../../../server/http/handler';

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
