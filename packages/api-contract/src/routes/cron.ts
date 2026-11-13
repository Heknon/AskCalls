import { z } from 'zod';
import { defineRoute } from '../route';

/**
 * Daily retention job (spec 9), invoked by Vercel Cron (GET) or the in-process scheduler.
 * Requires `Authorization: Bearer <CRON_SECRET>`; fails closed in production without one.
 */
export const cronRetention = defineRoute({
  method: 'GET',
  path: '/api/cron/retention',
  auth: 'cron',
  response: z.object({
    usersProcessed: z.number().int(),
    callsDeleted: z.number().int(),
    inboxExpired: z.number().int(),
    linkSessionsExpired: z.number().int(),
    rateBucketsExpired: z.number().int(),
  }),
});
