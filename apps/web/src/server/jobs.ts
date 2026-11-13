import type { Ports } from '@askcalls/domain';
import { runRetentionPurge } from '@askcalls/domain/use-cases/retention';

/**
 * Daily jobs (spec 3.2 Scheduler). The in-process scheduler runs them on a timer; on Vercel the
 * cron route (/api/cron/retention) runs the same use case.
 */
export function registerJobs(ports: Ports): void {
  ports.scheduler.register('retention', async () => {
    await runRetentionPurge(ports);
  });
}
