import { testInstanceConnection } from '@askcalls/api-contract/routes/admin';
import { requireAdmin } from '@askcalls/domain/use-cases/admin';
import { testConnection } from '../../../../../server/admin/connection-test';
import { configProblem } from '../../../../../server/admin/instance';
import { getConfigService } from '../../../../../server/container';
import { route } from '../../../../../server/http/handler';

export const POST = route(
  testInstanceConnection,
  async ({ container, actor, body }) => {
    await requireAdmin(container.ports, actor);
    const configService = await getConfigService();
    let proposed: ReturnType<typeof configService.preview>;
    try {
      proposed = configService.preview(body.patch, { allowIncomplete: true });
    } catch (e) {
      return configProblem(e);
    }
    return testConnection(body.port, proposed.config, configService.get().config);
  },
  { rateLimit: { name: 'admin-test', limit: 20, windowMs: 60_000 } },
);
