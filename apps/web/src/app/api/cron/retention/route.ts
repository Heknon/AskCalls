import { cronRetention } from '@askcalls/api-contract/routes/cron';
import { runRetentionPurge } from '@askcalls/domain/use-cases/retention';
import { route } from '../../../../server/http/handler';

/** Vercel Cron sends GET; the handler is the same use case the in-process scheduler runs. */
export const GET = route(cronRetention, ({ ports }) => runRetentionPurge(ports));
export const POST = GET;
