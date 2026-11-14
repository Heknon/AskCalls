import { deleteCall, getCall, updateCall } from '@askcalls/api-contract/routes/calls';
import {
  deleteCall as del,
  getCall as get,
  updateCall as update,
} from '@askcalls/domain/use-cases/calls';
import { route } from '../../../../server/http/handler';

export const GET = route(getCall, ({ ports, actor, params }) => get(ports, actor, params.id));

export const PATCH = route(
  updateCall,
  ({ ports, actor, params, body }) =>
    update(ports, actor, params.id, {
      ...(body.metaCt && { metaCt: body.metaCt }),
      ...(body.tagToks && { tagToks: body.tagToks }),
      ...(body.contactTok !== undefined && { contactTok: body.contactTok }),
      ...(body.recording !== undefined && { recording: body.recording }),
    }),
  { maxBodyBytes: 256 * 1024 },
);

export const DELETE = route(deleteCall, async ({ ports, actor, params }) => {
  await del(ports, actor, params.id);
  return { deleted: true as const };
});
