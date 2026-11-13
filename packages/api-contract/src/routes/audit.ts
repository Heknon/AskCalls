import { z } from 'zod';
import { defineRoute } from '../route';
import { DateCodec, QInt } from '../wire';

export const AuditEventSchema = z.object({
  id: z.string(),
  at: DateCodec,
  /** `session`, `system`, `token:<id>` or `agent:<deviceId>`. */
  actor: z.string(),
  action: z.string(),
  callId: z.string().nullable(),
  /** Ids, counts and codes only. */
  meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const listAudit = defineRoute({
  method: 'GET',
  path: '/api/audit',
  auth: 'session',
  query: z.object({
    cursor: z.string().max(512).optional(),
    limit: QInt.pipe(z.number().int().min(1).max(100)).optional(),
    action: z
      .string()
      .regex(/^[a-z_.]{1,40}$/)
      .optional(),
  }),
  response: z.object({ items: z.array(AuditEventSchema), nextCursor: z.string().nullable() }),
});
