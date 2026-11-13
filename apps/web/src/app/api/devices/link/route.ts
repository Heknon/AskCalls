import { startLink } from '@askcalls/api-contract/routes/devices';
import { startDeviceLink } from '@askcalls/domain/use-cases/devices';
import { route } from '../../../../server/http/handler';

export const POST = route(startLink, ({ ports, actor }) => startDeviceLink(ports, actor), {
  rateLimit: { name: 'link-start', limit: 10, windowMs: 600_000 },
});
