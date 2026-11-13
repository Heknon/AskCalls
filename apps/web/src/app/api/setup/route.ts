import { verifySetup } from '@askcalls/api-contract/routes/setup';
import { setupState } from '../../../server/admin/setup';
import { getConfigService } from '../../../server/container';
import { setupRoute } from '../../../server/http/setup-handler';

export const POST = setupRoute(verifySetup, async () => setupState(await getConfigService()));
