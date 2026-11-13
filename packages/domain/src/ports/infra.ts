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
  /**
   * Fixed-window usage counter for quotas (transcription seconds per month, asks per day).
   * Atomically adds `amount` to the counter for (`key`, `window.start`) unless the total would
   * exceed `limit`; `limit: null` always adds. A negative `amount` refunds. Returns whether it
   * was added and the total after. The counter may be deleted once `window.end` has passed.
   */
  consume(
    key: string,
    window: UsageWindow,
    amount: number,
    limit: number | null,
  ): Promise<UsageResult>;
  /** Current total of a fixed-window counter; 0 when it has never been used. */
  usage(key: string, windowStart: Date): Promise<number>;
  /**
   * Deletes sliding windows no longer weighed by `hit` and counters whose window ended at or
   * before `now`. Returns how many were deleted.
   */
  deleteExpired(now: Date): Promise<number>;
}

export interface UsageWindow {
  start: Date;
  end: Date;
}

export interface UsageResult {
  allowed: boolean;
  /** Counter total after the call (unchanged when not allowed). */
  used: number;
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
  | { name: 'agent_linked' }
  /** A marketing page view: the route only (one of the fixed marketing paths), no visitor id. */
  | { name: 'page_view'; route: string };

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
