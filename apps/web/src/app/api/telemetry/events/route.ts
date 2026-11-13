import { reportEvent } from '@askcalls/api-contract/routes/telemetry';
import { route } from '../../../../server/http/handler';

export const POST = route(
  reportEvent,
  async ({ ports, actor, body }) => {
    const user = await ports.users.findById(actor.userId);
    if (user?.telemetryConsent.productEvents) ports.telemetry.event(actor.userId, body);
    return {};
  },
  { rateLimit: { name: 'telemetry-events', limit: 30, windowMs: 60_000 } },
);
