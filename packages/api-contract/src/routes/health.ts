import { z } from 'zod';
import { defineRoute } from '../route';

export const getHealth = defineRoute({
  method: 'GET',
  path: '/api/health',
  auth: 'public',
  response: z.object({
    ok: z.boolean(),
    checks: z.record(z.string(), z.object({ ok: z.boolean(), message: z.string() })),
  }),
});
