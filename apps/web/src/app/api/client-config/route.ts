import { getClientConfig } from '@askcalls/api-contract/routes/account';
import { embeddingModelUrl } from '../../../server/http/csp';
import { route } from '../../../server/http/handler';

export const GET = route(getClientConfig, async ({ container }) => ({
  embeddingModelUrl: embeddingModelUrl(container.config.config),
}));
