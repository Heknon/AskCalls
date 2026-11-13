import { recordingDownload } from '@askcalls/api-contract/routes/calls';
import { presignRecordingDownload } from '@askcalls/domain/use-cases/calls';
import { route } from '../../../../../server/http/handler';

export const GET = route(recordingDownload, ({ ports, actor, params }) =>
  presignRecordingDownload(ports, actor, params.id),
);
