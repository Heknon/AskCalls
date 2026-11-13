import { CronRouteScheduler, InProcessScheduler } from '@askcalls/adapter-runtime';
import type { Scheduler } from '@askcalls/domain';
import type { InstanceConfig } from '../config/schema';

export function buildScheduler(config: InstanceConfig): Scheduler {
  return config.scheduler === 'vercel-cron' ? new CronRouteScheduler() : new InProcessScheduler();
}
