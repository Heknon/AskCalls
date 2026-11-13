import { getMe } from '@askcalls/api-contract/routes/account';
import { getMe as getMeUseCase } from '@askcalls/domain/use-cases/account';
import { route } from '../../../server/http/handler';

export const GET = route(getMe, ({ ports, actor }) => getMeUseCase(ports, actor));
