import { getRetention, putRetention } from '@askcalls/api-contract/routes/settings';
import {
  getRetention as getRetentionUseCase,
  setRetention,
} from '@askcalls/domain/use-cases/retention';
import { route } from '../../../../server/http/handler';

export const GET = route(getRetention, ({ ports, actor }) => getRetentionUseCase(ports, actor));

export const PUT = route(putRetention, ({ ports, actor, body }) =>
  setRetention(ports, actor, body.retentionDays),
);
