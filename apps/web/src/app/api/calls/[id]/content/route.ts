import { replaceCallContent } from '@askcalls/api-contract/routes/calls';
import { replaceCallContent as replace } from '@askcalls/domain/use-cases/calls';
import { route } from '../../../../../server/http/handler';

export const PUT = route(
  replaceCallContent,
  ({ ports, actor, params, body }) => replace(ports, actor, params.id, body),
  { maxBodyBytes: 8 * 1024 * 1024 },
);
