import { recordingUpload } from '@askcalls/api-contract/routes/calls';
import { presignRecordingUpload } from '@askcalls/domain/use-cases/calls';
import { route } from '../../../../../server/http/handler';

export const POST = route(recordingUpload, ({ ports, actor, params, body }) =>
  presignRecordingUpload(ports, actor, params.id, body),
);
