import { getInstance, updateInstance } from '@askcalls/api-contract/routes/admin';
import { applyAdminPatch } from '../../../../server/admin/apply';
import { instanceView } from '../../../../server/admin/instance';
import { getConfigService } from '../../../../server/container';
import { route } from '../../../../server/http/handler';

export const GET = route(getInstance, async ({ container, actor }) =>
  instanceView(container, await getConfigService(), actor),
);

export const PATCH = route(
  updateInstance,
  ({ container, actor, body }) => applyAdminPatch(container, actor, body.patch),
  { rateLimit: { name: 'admin-update', limit: 30, windowMs: 60_000 } },
);
