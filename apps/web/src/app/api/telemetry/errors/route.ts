import { reportError } from '@askcalls/api-contract/routes/telemetry';
import { route } from '../../../../server/http/handler';

export const POST = route(
  reportError,
  async ({ ports, actor, body }) => {
    const user = await ports.users.findById(actor.userId);
    if (user?.telemetryConsent.errorReports) ports.telemetry.error({ code: 'client', ...body });
    return {};
  },
  { rateLimit: { name: 'telemetry-errors', limit: 10, windowMs: 60_000 } },
);
