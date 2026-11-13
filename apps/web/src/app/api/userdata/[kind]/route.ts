import { getUserData, putUserData } from '@askcalls/api-contract/routes/userdata';
import { getUserData as get, putUserData as put } from '@askcalls/domain/use-cases/userdata';
import { route } from '../../../../server/http/handler';

export const GET = route(getUserData, ({ ports, actor, params }) => get(ports, actor, params.kind));

export const PUT = route(
  putUserData,
  ({ ports, actor, params, body }) => put(ports, actor, params.kind, body),
  { maxBodyBytes: 3 * 1024 * 1024 },
);
