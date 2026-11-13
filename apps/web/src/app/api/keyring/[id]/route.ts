import { getKeyringEntry, revokeKeyring } from '@askcalls/api-contract/routes/keyring';
import {
  getKeyringEntry as getEntry,
  revokeKeyringEntry,
} from '@askcalls/domain/use-cases/keyring';
import { route } from '../../../../server/http/handler';

export const GET = route(getKeyringEntry, ({ ports, actor, params }) =>
  getEntry(ports, actor, params.id),
);

export const DELETE = route(revokeKeyring, async ({ ports, actor, params }) => {
  await revokeKeyringEntry(ports, actor, params.id);
  return { revoked: true as const };
});
