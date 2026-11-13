import { fixOfflineBlocker } from '@askcalls/api-contract/routes/admin';
import { DomainError } from '@askcalls/domain';
import { requireAdmin } from '@askcalls/domain/use-cases/admin';
import { applyAdminPatch } from '../../../../../server/admin/apply';
import { type FixId, fixPatch, offlineBlockers } from '../../../../../server/config/offline';
import { getConfigService } from '../../../../../server/container';
import { route } from '../../../../../server/http/handler';

export const POST = route(
  fixOfflineBlocker,
  async ({ container, actor, body }) => {
    await requireAdmin(container.ports, actor);
    const { config, locked } = (await getConfigService()).get();
    const blocker = offlineBlockers(config, locked).find((b) => b.id === body.blocker);
    const fix = blocker?.fixes.find((f) => f === body.fix) as FixId | undefined;
    const patch = blocker && fix ? fixPatch(config, blocker.id, fix) : null;
    if (!patch) throw new DomainError('not_found', 'no such fix for this setting');
    return applyAdminPatch(container, actor, patch);
  },
  { rateLimit: { name: 'admin-update', limit: 30, windowMs: 60_000 } },
);
