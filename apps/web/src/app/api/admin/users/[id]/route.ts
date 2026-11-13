import { getAccount } from '@askcalls/api-contract/routes/admin';
import { getAccount as get } from '@askcalls/domain/use-cases/admin';
import { route } from '../../../../../server/http/handler';

export const GET = route(getAccount, ({ ports, actor, params }) => get(ports, actor, params.id), {
  rateLimit: { name: 'admin-accounts', limit: 60, windowMs: 60_000 },
});
