import { z } from 'zod';
import { CLIENT_SHARE, RATE_LIMITS } from './rate-limits';
import { buildPath, type RouteDef } from './route';
import { ErrorBody } from './wire';

/**
 * Typed API client, isomorphic (browser, agent, tests). Takes domain-form values (Uint8Array,
 * bigint, Float32Array, Date), encodes them with the route's codecs, and decodes responses.
 * Non-2xx responses throw `ApiError` with the server's content-free code.
 */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type HasKey<D, K extends string> = D extends { [P in K]: infer S } ? S : never;
type Out<S> = S extends z.ZodType ? z.output<S> : never;

type ParamsPart<D> = [HasKey<D, 'params'>] extends [never]
  ? { params?: undefined }
  : { params: Out<HasKey<D, 'params'>> };
type QueryPart<D> = [HasKey<D, 'query'>] extends [never]
  ? { query?: undefined }
  : object extends Out<HasKey<D, 'query'>>
    ? { query?: Out<HasKey<D, 'query'>> }
    : { query: Out<HasKey<D, 'query'>> };
type BodyPart<D> = [HasKey<D, 'body'>] extends [never]
  ? [HasKey<D, 'rawBody'>] extends [never]
    ? { body?: undefined }
    : { raw: { bytes: Uint8Array; contentType: string } }
  : { body: Out<HasKey<D, 'body'>> };

export type RequestFor<D> = ParamsPart<D> & QueryPart<D> & BodyPart<D>;
export type ResponseFor<D> = Out<HasKey<D, 'response'>>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, string | number | boolean | null> = {},
    /** From `Retry-After` on 429 responses. */
    readonly retryAfterSec: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  /** Origin of the server, e.g. `https://askcalls.com`. Empty for same-origin browser use. */
  baseUrl?: string;
  fetch?: FetchLike;
  /** Personal access token (`ac_…`) for the agent; browsers use the session cookie. */
  token?: string;
  headers?: Record<string, string>;
  /**
   * Requests per minute this client sends at most. Defaults to a share of the server's limit for
   * the caller (per token with `token`, else per user); 0 sends without pacing.
   */
  maxPerMinute?: number;
  /** For tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Waits between attempts: network errors and 502–504 on requests that are safe to repeat. */
const BACKOFF_MS = [1_000, 3_000, 7_000];
/** A 429 asking for a longer wait (a daily limit) is reported instead of waited out. */
const MAX_RETRY_AFTER_SEC = 60;
const IDEMPOTENT = new Set(['GET', 'HEAD', 'PUT', 'DELETE']);
const RETRY_STATUS = new Set([502, 503, 504]);

/**
 * A token bucket shared by every request of one client, so a bulk import never sends faster
 * than the server accepts; a 429 stops every request until its Retry-After has passed.
 */
function createPacer(perMinute: number, now: () => number, sleep: (ms: number) => Promise<void>) {
  const capacity = Math.max(1, Math.round(perMinute / 30));
  const perMs = perMinute / 60_000;
  let tokens = capacity;
  let last = now();
  let blockedUntil = 0;
  let turn: Promise<void> = Promise.resolve();
  const take = async () => {
    for (;;) {
      const t = now();
      if (t < blockedUntil) {
        await sleep(blockedUntil - t);
        continue;
      }
      if (perMinute <= 0) return;
      tokens = Math.min(capacity, tokens + (t - last) * perMs);
      last = t;
      if (tokens >= 1) {
        tokens -= 1;
        return;
      }
      await sleep(Math.ceil((1 - tokens) / perMs));
    }
  };
  return {
    acquire(): Promise<void> {
      turn = turn.then(take);
      return turn;
    },
    block(ms: number) {
      blockedUntil = Math.max(blockedUntil, now() + ms);
      tokens = 0;
    },
  };
}

function retryAfterSec(res: Response): number | null {
  const retry = res.headers.get('Retry-After');
  return retry && /^\d+$/.test(retry) ? Number.parseInt(retry, 10) : null;
}

function encodeQuery(schema: z.ZodType, value: unknown): string {
  const wire = z.encode(schema, value) as Record<string, string | undefined>;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(wire)) if (v !== undefined) qs.set(k, v);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

async function toApiError(res: Response): Promise<ApiError> {
  const retryAfter = retryAfterSec(res);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Not JSON (proxy error page): fall through to a generic error.
  }
  const parsed = ErrorBody.safeParse(body);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new ApiError(res.status, code, message, details ?? {}, retryAfter);
  }
  return new ApiError(res.status, 'http_error', `HTTP ${res.status}`, {}, retryAfter);
}

export function createApiClient(opts: ApiClientOptions = {}) {
  const baseUrl = (opts.baseUrl ?? '').replace(/\/$/, '');
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const limit = opts.token ? RATE_LIMITS.perToken.limit : RATE_LIMITS.perUser.limit;
  const pacer = createPacer(opts.maxPerMinute ?? Math.floor(limit * CLIENT_SHARE), now, sleep);

  async function send<D extends RouteDef>(route: D, input: RequestFor<D>): Promise<Response> {
    const i = input as {
      params?: unknown;
      query?: unknown;
      body?: unknown;
      raw?: { bytes: Uint8Array; contentType: string };
    };
    const params = route.params
      ? (z.encode(route.params, i.params) as Record<string, string>)
      : undefined;
    const query = route.query && i.query !== undefined ? encodeQuery(route.query, i.query) : '';
    const headers: Record<string, string> = { ...opts.headers };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    let body: BodyInit | undefined;
    if (route.body) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(z.encode(route.body, i.body));
    } else if (route.rawBody && i.raw) {
      headers['Content-Type'] = i.raw.contentType;
      body = i.raw.bytes as BodyInit;
    }
    const url = `${baseUrl}${buildPath(route.path, params)}${query}`;
    const repeatable = IDEMPOTENT.has(route.method);
    for (let attempt = 1; ; attempt++) {
      const last = attempt > BACKOFF_MS.length;
      await pacer.acquire();
      let res: Response;
      try {
        res = await doFetch(url, {
          method: route.method,
          headers,
          ...(body !== undefined && { body }),
          cache: 'no-store',
        });
      } catch (e) {
        if (last || !repeatable || (e as Error)?.name === 'AbortError') throw e;
        await sleep(BACKOFF_MS[attempt - 1]!);
        continue;
      }
      if (res.ok) return res;
      if (!last && res.status === 429) {
        // Refused before the handler ran, so any method is safe to send again.
        const sec = retryAfterSec(res);
        if (sec === null || sec <= MAX_RETRY_AFTER_SEC) {
          await res.body?.cancel().catch(() => {});
          pacer.block(sec === null ? BACKOFF_MS[attempt - 1]! : sec * 1_000);
          continue;
        }
      }
      if (!last && repeatable && RETRY_STATUS.has(res.status)) {
        await res.body?.cancel().catch(() => {});
        await sleep(BACKOFF_MS[attempt - 1]!);
        continue;
      }
      throw await toApiError(res);
    }
  }

  return {
    /** JSON request/response routes. */
    async request<D extends RouteDef>(route: D, input: RequestFor<D>): Promise<ResponseFor<D>> {
      const res = await send(route, input);
      if (!route.response) throw new Error(`${route.path} has no JSON response`);
      return route.response.parse(await res.json()) as ResponseFor<D>;
    },
    /** Streaming text routes (`/api/ask`): yields decoded text chunks. */
    async *stream<D extends RouteDef>(route: D, input: RequestFor<D>): AsyncIterable<string> {
      const res = await send(route, input);
      if (!res.body) return;
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        if (value) yield value;
      }
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
