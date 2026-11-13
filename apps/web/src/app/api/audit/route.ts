import { listAudit } from '@askcalls/api-contract/routes/audit';
import type { AuditAction } from '@askcalls/domain';
import { listAudit as list } from '@askcalls/domain/use-cases/account';
import { route } from '../../../server/http/handler';

export const GET = route(listAudit, ({ ports, actor, query }) =>
  list(ports, actor, {
    ...(query.cursor !== undefined && { cursor: query.cursor }),
    ...(query.limit !== undefined && { limit: query.limit }),
    ...(query.action !== undefined && { action: query.action as AuditAction }),
  }),
);
