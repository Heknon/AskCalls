import type { DomainErrorCode } from './entities/errors';
import type { ErrorReport, SafeValue, Telemetry, TelemetryEvent } from './ports/infra';

/**
 * The one telemetry scrubber (spec 11.3a). Every telemetry adapter is a `TelemetrySink` behind
 * `scrubbedTelemetry`, so a backend only ever receives `TelemetryRecord`s: the output of an
 * allow-list. Allowed are ids (UUIDs), counts, durations, route names from the instance's own
 * route table, error codes from a fixed list, and enum values each event declares. Messages,
 * bodies, query strings, headers, free text, and any field or value off the list are dropped,
 * whatever a caller passes at runtime.
 */

export type TelemetryFields = Record<string, string | number | boolean | null>;

export type TelemetryRecord =
  | { kind: 'event'; at: number; userId: string | null; name: string; fields: TelemetryFields }
  | {
      kind: 'error';
      at: number;
      code: string;
      route: string | null;
      errorName: string | null;
      /** `file:line:col` per frame; function names and directories are not kept. */
      frames: string[];
      fields: TelemetryFields;
    }
  | { kind: 'timing'; at: number; name: string; ms: number; fields: TelemetryFields };

export interface TelemetrySink {
  /** Which record kinds this backend takes (Sentry: errors only, PostHog: events only, …). */
  readonly accepts: ReadonlyArray<TelemetryRecord['kind']>;
  send(records: TelemetryRecord[]): Promise<void>;
}

export interface ScrubOptions {
  /** True for the instance's own route names (API route templates, fixed page paths). */
  isRoute(route: string): boolean;
}

const ONBOARDING_STEPS = ['welcome', 'passkey', 'recovery', 'try', 'ai'] as const;
const UPLOAD_MODES = ['single', 'bulk', 'agent', 'inbox'] as const;
const SEARCH_FILTERS = [
  'keyword',
  'contact',
  'tag',
  'intent',
  'starred',
  'date',
  'semantic',
] as const;

const DOMAIN_CODES: readonly DomainErrorCode[] = [
  'not_found',
  'forbidden',
  'unauthorized',
  'conflict',
  'duplicate',
  'version_conflict',
  'quota_exceeded',
  'rate_limited',
  'invalid',
  'unsupported',
  'provider_error',
];
/** Error codes a report may carry; anything else is reported as `other`. */
export const TELEMETRY_ERROR_CODES: ReadonlySet<string> = new Set([
  ...DOMAIN_CODES,
  'internal',
  'auth',
  'client',
  'config',
  'other',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An exception class name (`TypeError`, `DomainError`, Auth.js's `CredentialsSignin`). */
const ERROR_NAME = /^[A-Z][A-Za-z0-9]{0,47}(Error|Exception|Signin)$/;
/** A timing name the code defines: `askcalls.<metric>`. Routes are accepted through `isRoute`. */
const METRIC_NAME = /^askcalls\.[a-z][a-z0-9_.]{0,62}$/;
/** A context key: an identifier. */
const FIELD_KEY = /^[a-z][A-Za-z0-9]{0,31}$/;
const MAX_FIELDS = 16;
const MAX_FRAMES = 30;
const MAX_COUNT = 1e9;

const oneOf = <T extends string>(values: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (values as readonly string[]).includes(v);

const count = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_COUNT ? v : null;

const uuidOrNull = (v: unknown): string | null =>
  typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null;

/**
 * A query string, fragment or trailing slash never reaches a backend, and the rest must be one
 * of the instance's route names.
 */
function routeName(v: unknown, opts: ScrubOptions): string | null {
  if (typeof v !== 'string' || v.length > 128) return null;
  const path = v.split(/[?#]/, 1)[0]!;
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return opts.isRoute(trimmed) ? trimmed : null;
}

/**
 * Context and tag values: numbers and booleans as they are; strings only when they are UUIDs
 * under a key ending in `Id`, error codes under `code`, or route names under `route`.
 */
function safeFields(input: unknown, opts: ScrubOptions): TelemetryFields {
  const out: TelemetryFields = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  let n = 0;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (n >= MAX_FIELDS) break;
    if (!FIELD_KEY.test(key)) continue;
    let safe: SafeValue | undefined;
    if (value === null || typeof value === 'boolean') safe = value;
    else if (typeof value === 'number' && Number.isFinite(value)) safe = value;
    else if (typeof value === 'string') {
      if (key.endsWith('Id')) safe = uuidOrNull(value) ?? undefined;
      else if (key === 'code') safe = TELEMETRY_ERROR_CODES.has(value) ? value : undefined;
      else if (key === 'route') safe = routeName(value, opts) ?? undefined;
    }
    if (safe === undefined) continue;
    out[key] = safe;
    n++;
  }
  return out;
}

/** Event name → its fields, rebuilt from the allow-list; null drops the event. */
function eventFields(e: Record<string, unknown>, opts: ScrubOptions): TelemetryFields | null {
  switch (e.name) {
    case 'sign_up':
    case 'first_upload':
    case 'first_search_with_result':
    case 'agent_linked':
      return {};
    case 'onboarding_step':
      return oneOf(ONBOARDING_STEPS, e.step) ? { step: e.step } : null;
    case 'upload': {
      const n = count(e.count);
      return oneOf(UPLOAD_MODES, e.mode) && n !== null ? { mode: e.mode, count: n } : null;
    }
    case 'search': {
      if (!Array.isArray(e.filters)) return null;
      const filters = [...new Set(e.filters.filter((f) => oneOf(SEARCH_FILTERS, f)))].sort();
      return { filters: filters.join(','), filterCount: filters.length };
    }
    case 'page_view': {
      const route = routeName(e.route, opts);
      return route ? { route } : null;
    }
    default:
      return null;
  }
}

export function scrubEvent(
  userId: string | null,
  event: TelemetryEvent,
  opts: ScrubOptions,
  at = Date.now(),
): TelemetryRecord | null {
  if (!event || typeof event !== 'object') return null;
  const e = event as unknown as Record<string, unknown>;
  const fields = eventFields(e, opts);
  if (!fields) return null;
  return { kind: 'event', at, userId: uuidOrNull(userId), name: e.name as string, fields };
}

/**
 * Stack frames as `file:line:col`: the message line and every non-frame line are dropped, and of
 * each location only the file name is kept (no function name, directory, query or fragment).
 */
function frames(stack: unknown): string[] {
  if (typeof stack !== 'string') return [];
  const out: string[] = [];
  for (const line of stack.split('\n')) {
    const m = /^\s*at (?:.*? \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line);
    if (!m) continue;
    const file = m[1]!.split(/[?#]/, 1)[0]!.split(/[/\\]/).pop()!;
    if (!/^[\w.-]{1,80}$/.test(file)) continue;
    out.push(`${file}:${m[2]}:${m[3]}`);
    if (out.length >= MAX_FRAMES) break;
  }
  return out;
}

export function scrubError(
  report: ErrorReport,
  opts: ScrubOptions,
  at = Date.now(),
): TelemetryRecord {
  const r = (report ?? {}) as unknown as Record<string, unknown>;
  const code = typeof r.code === 'string' && TELEMETRY_ERROR_CODES.has(r.code) ? r.code : 'other';
  return {
    kind: 'error',
    at,
    code,
    route: routeName(r.route, opts),
    errorName: typeof r.errorName === 'string' && ERROR_NAME.test(r.errorName) ? r.errorName : null,
    frames: frames(r.stack),
    fields: safeFields(r.context, opts),
  };
}

export function scrubTiming(
  name: string,
  ms: number,
  tags: Record<string, SafeValue> | undefined,
  opts: ScrubOptions,
  at = Date.now(),
): TelemetryRecord | null {
  const safeName =
    typeof name === 'string' && METRIC_NAME.test(name) ? name : routeName(name, opts);
  if (!safeName || typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
  return {
    kind: 'timing',
    at,
    name: safeName,
    ms: Math.round(ms * 1000) / 1000,
    fields: safeFields(tags, opts),
  };
}

export interface ScrubbedTelemetryOptions extends ScrubOptions {
  /** Records held before a send (default 50). */
  maxBatch?: number;
  /** A partial batch is sent this long after its first record (default 10 s). */
  flushIntervalMs?: number;
  /** Records kept while a backend is unreachable; older ones are dropped (default 1000). */
  maxQueue?: number;
}

/**
 * The Telemetry port over sinks: scrubs every call, batches per sink, and never throws or
 * blocks the caller. A failed send drops its batch; telemetry is best effort.
 */
export function scrubbedTelemetry(
  sinks: readonly TelemetrySink[],
  opts: ScrubbedTelemetryOptions,
): Telemetry {
  const maxBatch = opts.maxBatch ?? 50;
  const interval = opts.flushIntervalMs ?? 10_000;
  const maxQueue = opts.maxQueue ?? 1000;
  const queues = sinks.map(() => [] as TelemetryRecord[]);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<unknown> = Promise.resolve();

  const sendAll = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    const sends = sinks.map((sink, i) => {
      const batch = queues[i]!.splice(0);
      return batch.length ? sink.send(batch).catch(() => {}) : Promise.resolve();
    });
    const done = Promise.all(sends).then(() => {});
    inFlight = Promise.all([inFlight, done]);
    return done;
  };

  const push = (record: TelemetryRecord | null) => {
    if (!record) return;
    let full = false;
    sinks.forEach((sink, i) => {
      if (!sink.accepts.includes(record.kind)) return;
      const q = queues[i]!;
      q.push(record);
      if (q.length > maxQueue) q.shift();
      if (q.length >= maxBatch) full = true;
    });
    if (full) {
      void sendAll();
    } else if (!timer) {
      timer = setTimeout(() => void sendAll(), interval);
      (timer as { unref?: () => void }).unref?.();
    }
  };

  const guard = (fn: () => void) => {
    try {
      fn();
    } catch {}
  };

  return {
    event: (userId, event) => guard(() => push(scrubEvent(userId, event, opts))),
    error: (report) => guard(() => push(scrubError(report, opts))),
    timing: (name, ms, tags) => guard(() => push(scrubTiming(name, ms, tags, opts))),
    flush: async () => {
      await sendAll();
      await inFlight;
    },
  };
}
