import { getMe } from '@askcalls/api-contract/routes/account';
import { getMe as getMeUseCase } from '@askcalls/domain/use-cases/account';
import { route } from '../../../server/http/handler';
import { googleStorageClient } from '../../../server/storage/google';

export const GET = route(getMe, async ({ ports, actor, container }) => {
  const me = await getMeUseCase(ports, actor);
  return {
    ...me,
    features: {
      ...me.features,
      storage: { googleDrive: googleStorageClient(container.config) !== null },
    },
  };
});
