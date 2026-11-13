import { setupPasskeyOptions } from '@askcalls/api-contract/routes/setup';
import { passkeyOptions } from '../../../../server/admin/setup';
import { getConfigService } from '../../../../server/container';
import { setupRoute } from '../../../../server/http/setup-handler';

export const POST = setupRoute(setupPasskeyOptions, async (body) => ({
  options: await passkeyOptions((await getConfigService()).get().config.appUrl, body.email),
}));
