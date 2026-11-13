import type { UserId } from '../entities/common';
import type { HealthCheckable } from './health';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export interface RateLimiter extends HealthCheckable {
  /** Sliding window: records one hit for `key` and reports whether it is within `limit`. */
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

/** Allowed telemetry fields: ids, counts, durations, route names, error codes. Nothing else. */
export type SafeValue = string | number | boolean | null;

export type TelemetryEvent =
  | { name: 'sign_up' }
  | { name: 'onboarding_step'; step: string }
  | { name: 'first_upload' }
  | { name: 'first_search_with_result' }
  | { name: 'upload'; mode: 'single' | 'bulk' | 'agent' | 'inbox'; count: number }
  | {
      name: 'search';
      filters: Array<'keyword' | 'contact' | 'tag' | 'intent' | 'starred' | 'date' | 'semantic'>;
    }
  | { name: 'agent_linked' };

export interface ErrorReport {
  code: string;
  route?: string;
  /** Exception class name and stack frames only; the message is dropped by the scrubber. */
  errorName?: string;
  stack?: string;
  context?: Record<string, SafeValue>;
}

export interface Telemetry {
  event(userId: UserId | null, event: TelemetryEvent): void;
  error(report: ErrorReport): void;
  timing(name: string, ms: number, tags?: Record<string, SafeValue>): void;
  flush(): Promise<void>;
}

export interface BillingProvider {
  readonly id: string;
  createCheckout(userId: UserId, plan: string): Promise<{ url: string }>;
  customerPortal(userId: UserId): Promise<{ url: string }>;
  handleWebhook(body: Uint8Array, headers: Record<string, string>): Promise<void>;
}

export type JobName =
  | 'retention'
  | 'inbox-expiry'
  | 'vocab-compaction-check'
  | 'link-session-expiry';

export interface Scheduler {
  /** Registers a daily job. On Vercel the cron route invokes `run`; in-process runs a timer. */
  register(name: JobName, handler: () => Promise<void>): void;
  run(name: JobName): Promise<void>;
  start(): void;
  stop(): void;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  /** Time-ordered UUID v7 (calls). */
  uuidv7(): string;
  /** Random URL-safe id (everything else). */
  randomId(): string;
}
