import { setTelemetryConsent } from '@askcalls/api-contract/routes/settings';
import { setTelemetryConsent as setConsent } from '@askcalls/domain/use-cases/account';
import { route } from '../../../../server/http/handler';

export const POST = route(setTelemetryConsent, ({ ports, actor, body }) =>
  setConsent(ports, actor, body),
);
