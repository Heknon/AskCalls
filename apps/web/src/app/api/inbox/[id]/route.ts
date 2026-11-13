import { deleteInbox } from '@askcalls/api-contract/routes/inbox';
import { deleteInboxItem } from '@askcalls/domain/use-cases/inbox';
import { route } from '../../../../server/http/handler';

export const DELETE = route(deleteInbox, async ({ ports, actor, params }) => {
  await deleteInboxItem(ports, actor, params.id);
  return { deleted: true as const };
});
