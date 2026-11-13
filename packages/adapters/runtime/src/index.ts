import {
  type BillingProvider,
  type Clock,
  DomainError,
  type IdGenerator,
  type JobName,
  type Scheduler,
  type Telemetry,
} from '@askcalls/domain';
import { uuidv7 } from 'uuidv7';

/** Clock `system`. */
export const systemClock: Clock = { now: () => new Date() };

/** IdGenerator `system`. */
export const systemIds: IdGenerator = {
  uuidv7: () => uuidv7(),
  randomId: () => {
    const b = crypto.getRandomValues(new Uint8Array(16));
    return btoa(String.fromCharCode(...b))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  },
};

/** Telemetry `none`: the default. Sends nothing anywhere. */
export const noTelemetry: Telemetry = {
  event() {},
  error() {},
  timing() {},
  flush: async () => {},
};

/** BillingProvider `none` (R1: free beta). */
export const noBilling: BillingProvider = {
  id: 'none',
  createCheckout: async () => {
    throw new DomainError('unsupported', 'billing is not enabled on this instance');
  },
  customerPortal: async () => {
    throw new DomainError('unsupported', 'billing is not enabled on this instance');
  },
  handleWebhook: async () => {
    throw new DomainError('unsupported', 'billing is not enabled on this instance');
  },
};

type Handler = () => Promise<void>;

class JobRegistry {
  protected jobs = new Map<JobName, Handler>();
  register(name: JobName, handler: Handler) {
    this.jobs.set(name, handler);
  }
  async run(name: JobName) {
    const job = this.jobs.get(name);
    if (!job) throw new DomainError('not_found', `no job registered: ${name}`);
    await job();
  }
}

/**
 * Scheduler `vercel-cron`: jobs run when the cron route calls `run`. Vercel invokes the route
 * on the schedule in vercel.json, production only.
 */
export class CronRouteScheduler extends JobRegistry implements Scheduler {
  start() {}
  stop() {}
}

/** Scheduler `in-process`: Docker and local mode. Runs every job once a day, and once at start. */
export class InProcessScheduler extends JobRegistry implements Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(
    private intervalMs = 86_400_000,
    private onError: (job: JobName, err: unknown) => void = () => {},
  ) {
    super();
  }
  private async runAll() {
    for (const name of this.jobs.keys()) {
      try {
        await this.run(name);
      } catch (err) {
        this.onError(name, err);
      }
    }
  }
  start() {
    if (this.timer) return;
    void this.runAll();
    this.timer = setInterval(() => void this.runAll(), this.intervalMs);
    (this.timer as { unref?: () => void }).unref?.();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
