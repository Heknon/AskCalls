import { confirmLink, fetchLink, getLink, joinLink } from '@askcalls/api-contract/routes/devices';
import {
  confirmDeviceLink,
  fetchDeviceLink,
  getDeviceLinkStatus,
  joinDeviceLink,
} from '@askcalls/domain/use-cases/devices';
import { errorResponse } from '../../../../../server/http/errors';
import { type NextHandler, peekJsonField, route } from '../../../../../server/http/handler';

/** Spec 6.5: the trusted device polls the joiner's public key to show its fingerprint. */
export const GET = route(getLink, ({ ports, actor, params }) =>
  getDeviceLinkStatus(ports, actor, params.session),
);

const joinRateLimit = { name: 'link-join', limit: 20, windowMs: 600_000 };

const join = route(
  joinLink,
  ({ ports, params, body }) => joinDeviceLink(ports, params.session, body),
  { rateLimit: joinRateLimit },
);
const confirm = route(confirmLink, ({ ports, actor, params, body }) =>
  confirmDeviceLink(ports, actor, params.session, body),
);
const fetchPayload = route(
  fetchLink,
  ({ ports, params, body }) => fetchDeviceLink(ports, params.session, body),
  { rateLimit: { name: 'link-fetch', limit: 120, windowMs: 600_000 } },
);

/** One URL, three steps: `join` and `fetch` prove the link secret, `confirm` needs a session. */
export const POST: NextHandler = async (req, ctx) => {
  const action = await peekJsonField(req, 'action');
  if (action === 'join') return join(req, ctx);
  if (action === 'confirm') return confirm(req, ctx);
  if (action === 'fetch') return fetchPayload(req, ctx);
  return errorResponse(400, 'invalid', 'invalid body: action');
};
