import { completeSetup } from '@askcalls/api-contract/routes/setup';
import { completeSetup as complete } from '../../../../server/admin/setup';
import { getConfigService } from '../../../../server/container';
import { setupRoute } from '../../../../server/http/setup-handler';

export const POST = setupRoute(completeSetup, async (body) =>
  complete(await getConfigService(), body.patch, body.admin),
);
