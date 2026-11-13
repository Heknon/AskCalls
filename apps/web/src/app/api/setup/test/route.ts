import { testSetupConnection } from '@askcalls/api-contract/routes/setup';
import { testConnection } from '../../../../server/admin/connection-test';
import { getConfigService } from '../../../../server/container';
import { setupRoute } from '../../../../server/http/setup-handler';

export const POST = setupRoute(testSetupConnection, async (body) => {
  const configService = await getConfigService();
  const proposed = configService.preview(body.patch, { allowIncomplete: true });
  return testConnection(body.port, proposed.config, null);
});
