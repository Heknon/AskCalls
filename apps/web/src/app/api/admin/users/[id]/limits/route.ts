import { updateAccountLimits } from '@askcalls/api-contract/routes/admin';
import { updateAccountLimits as update } from '@askcalls/domain/use-cases/admin';
import { route } from '../../../../../../server/http/handler';

export const PATCH = route(
  updateAccountLimits,
  ({ ports, actor, params, body }) => update(ports, actor, params.id, body.limits),
  { rateLimit: { name: 'admin-limits', limit: 30, windowMs: 60_000 } },
);
