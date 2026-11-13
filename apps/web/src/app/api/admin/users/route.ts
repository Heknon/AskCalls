import { promoteToAdmin } from '@askcalls/api-contract/routes/admin';
import { promoteUser } from '@askcalls/domain/use-cases/admin';
import { route } from '../../../../server/http/handler';

export const POST = route(
  promoteToAdmin,
  ({ ports, actor, body }) => promoteUser(ports, actor, body.email),
  { rateLimit: { name: 'admin-promote', limit: 20, windowMs: 60_000 } },
);
