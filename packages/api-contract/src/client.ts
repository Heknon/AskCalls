import { z } from 'zod';
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
}

function encodeQuery(schema: z.ZodType, value: unknown): string {
  const wire = z.encode(schema, value) as Record<string, string | undefined>;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(wire)) if (v !== undefined) qs.set(k, v);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

async function toApiError(res: Response): Promise<ApiError> {
  const retry = res.headers.get('Retry-After');
  const retryAfterSec = retry && /^\d+$/.test(retry) ? Number.parseInt(retry, 10) : null;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Not JSON (proxy error page): fall through to a generic error.
  }
  const parsed = ErrorBody.safeParse(body);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new ApiError(res.status, code, message, details ?? {}, retryAfterSec);
  }
  return new ApiError(res.status, 'http_error', `HTTP ${res.status}`, {}, retryAfterSec);
}

export function createApiClient(opts: ApiClientOptions = {}) {
  const baseUrl = (opts.baseUrl ?? '').replace(/\/$/, '');
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));

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
    const res = await doFetch(`${baseUrl}${buildPath(route.path, params)}${query}`, {
      method: route.method,
      headers,
      ...(body !== undefined && { body }),
      cache: 'no-store',
    });
    if (!res.ok) throw await toApiError(res);
    return res;
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
