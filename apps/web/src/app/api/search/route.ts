import { search } from '@askcalls/api-contract/routes/search';
import { searchCalls } from '@askcalls/domain/use-cases/search';
import { route } from '../../../server/http/handler';

export const POST = route(search, ({ ports, actor, body }) => searchCalls(ports, actor, body), {
  maxBodyBytes: 512 * 1024,
});
