import type { RouteDef } from '@askcalls/api-contract';
import type { ResponseFor } from '@askcalls/api-contract/client';
import { type ApiScope, DomainError, isDomainError, type Ports } from '@askcalls/domain';
import { type Actor, constantTimeEqual, requireUser } from '@askcalls/domain/use-cases/context';
import { authenticateApiToken } from '@askcalls/domain/use-cases/tokens';
import { z } from 'zod';
import { readSessionUserId } from '../auth/secret';
import { type Container, getContainer, SetupRequiredError } from '../container';
import { domainErrorResponse, errorResponse, NO_STORE } from './errors';

/**
 * The one way API routes are built. Per request it: resolves the actor (Auth.js session, or a
 * `Bearer ac_…` personal access token with the route's scope), rate-limits per user and per
 * token, validates params, query and body against the contract, runs the handler, encodes the
 * response with the contract, maps DomainError codes to statuses with content-free bodies, and
 * sets `Cache-Control: no-store` on every response. It never logs requests or bodies.
 */

type Out<S> = S extends z.ZodType ? z.output<S> : undefined;
type Field<D, K extends string> = D extends { [P in K]: infer S } ? Out<S> : undefined;

export interface HandlerContext<D extends RouteDef> {
  req: Request;
  container: Container;
  ports: Ports;
  /** Null only for `link`, `public` and `cron` routes. */
  actor: D['auth'] extends 'link' | 'public' | 'cron' ? null : Actor;
  params: Field<D, 'params'>;
  query: Field<D, 'query'>;
  body: Field<D, 'body'>;
  /** Raw request bytes for `rawBody` routes (held in memory only). */
  raw: D extends { rawBody: object } ? { bytes: Uint8Array; contentType: string } : undefined;
}

export interface RouteOptions {
  /** Extra per-user (or per-IP for unauthenticated routes) limit for this route. */
  rateLimit?: { name: string; limit: number; windowMs: number };
  /** JSON body cap in bytes (default 1 MiB). */
  maxBodyBytes?: number;
}

/** Next.js route-handler signature. */
export type NextHandler = (
  req: Request,
  ctx: { params: Promise<Record<string, string | string[] | undefined>> },
) => Promise<Response>;

/** Baseline limits for every authenticated request. */
export const RATE_LIMITS = {
  perUser: { limit: 600, windowMs: 60_000 },
  perToken: { limit: 300, windowMs: 60_000 },
  perIp: { limit: 60, windowMs: 60_000 },
} as const;

const DEFAULT_MAX_BODY = 1024 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || req.headers.get('x-real-ip') || 'unknown';
}

/** Reads at most `max` bytes of the body into memory; never to disk. */
async function readLimited(req: Request, max: number): Promise<Uint8Array> {
  const declared = req.headers.get('content-length');
  if (declared && Number(declared) > max) {
    throw new HttpError(413, 'payload_too_large', 'request body is too large');
  }
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      for (const c of chunks) c.fill(0);
      throw new HttpError(413, 'payload_too_large', 'request body is too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
    c.fill(0);
  }
  return out;
}

async function rateLimit(ports: Ports, key: string, limit: number, windowMs: number) {
  const r = await ports.rateLimiter.hit(key, limit, windowMs);
  if (!r.allowed) {
    const sec = Math.max(1, Math.ceil((r.resetAt.getTime() - ports.clock.now().getTime()) / 1000));
    throw new HttpError(429, 'rate_limited', 'too many requests', { 'Retry-After': String(sec) });
  }
}

async function resolveActor(
  def: RouteDef,
  req: Request,
  container: Container,
): Promise<Actor | null> {
  const { ports } = container;
  if (def.auth === 'public' || def.auth === 'link') return null;
  if (def.auth === 'cron') {
    const secret = container.config.config.cronSecret;
    if (!secret) {
      if (container.config.environment === 'production') {
        throw new HttpError(503, 'unavailable', 'cron secret is not configured');
      }
      return null;
    }
    const given = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1] ?? '';
    const enc = new TextEncoder();
    if (!constantTimeEqual(enc.encode(given), enc.encode(secret))) {
      throw new HttpError(401, 'unauthorized', 'invalid cron secret');
    }
    return null;
  }
  const bearer = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) {
    const { token, user } = await authenticateApiToken(ports, bearer);
    if (def.auth === 'session') {
      throw new DomainError('forbidden', 'this route needs a signed-in session');
    }
    if (!token.scopes.includes(def.auth as ApiScope)) {
      throw new DomainError('forbidden', 'token lacks the required scope', { scope: def.auth });
    }
    return { kind: 'token', userId: user.id, tokenId: token.id, scopes: token.scopes };
  }
  const userId = await readSessionUserId(req.headers, container.config);
  if (!userId) throw new DomainError('unauthorized', 'sign in required');
  await requireUser(ports, userId);
  return { kind: 'session', userId };
}

function searchParamsObject(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of url.searchParams) out[k] = v;
  return out;
}

function invalid(error: z.ZodError, where: string): HttpError {
  // Paths only, never values: a value could be content.
  const fields = error.issues.map((i) => i.path.join('.') || where).slice(0, 5);
  return new HttpError(400, 'invalid', `invalid ${where}: ${fields.join(', ')}`);
}

function withNoStore(res: Response): Response {
  // Responses from Response.json/new Response have mutable headers.
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export function route<const D extends RouteDef>(
  def: D,
  fn: (ctx: HandlerContext<D>) => Promise<ResponseFor<D> | Response>,
  opts: RouteOptions = {},
): NextHandler {
  return async (req, nextCtx) => {
    let container: Container;
    try {
      container = await getContainer();
    } catch (e) {
      const setup = e instanceof SetupRequiredError;
      return errorResponse(503, setup ? 'setup_required' : 'unavailable', 'instance unavailable');
    }
    const { ports } = container;
    try {
      const actor = await resolveActor(def, req, container);
      if (actor) {
        await rateLimit(
          ports,
          `rl:user:${actor.userId}`,
          RATE_LIMITS.perUser.limit,
          RATE_LIMITS.perUser.windowMs,
        );
        if (actor.kind === 'token') {
          await rateLimit(
            ports,
            `rl:token:${actor.tokenId}`,
            RATE_LIMITS.perToken.limit,
            RATE_LIMITS.perToken.windowMs,
          );
        }
      } else if (def.auth !== 'cron') {
        await rateLimit(
          ports,
          `rl:ip:${clientIp(req)}`,
          RATE_LIMITS.perIp.limit,
          RATE_LIMITS.perIp.windowMs,
        );
      }
      if (opts.rateLimit) {
        const who = actor ? actor.userId : `ip:${clientIp(req)}`;
        await rateLimit(
          ports,
          `rl:${opts.rateLimit.name}:${who}`,
          opts.rateLimit.limit,
          opts.rateLimit.windowMs,
        );
      }

      let params: unknown;
      if (def.params) {
        const p = def.params.safeParse(await nextCtx.params);
        if (!p.success) throw invalid(p.error, 'path');
        params = p.data;
      }
      let query: unknown;
      if (def.query) {
        const q = def.query.safeParse(searchParamsObject(new URL(req.url)));
        if (!q.success) throw invalid(q.error, 'query');
        query = q.data;
      }
      let body: unknown;
      let raw: { bytes: Uint8Array; contentType: string } | undefined;
      if (def.body) {
        const type = req.headers.get('content-type') ?? '';
        if (!type.toLowerCase().startsWith('application/json')) {
          throw new HttpError(415, 'unsupported_media_type', 'send application/json');
        }
        const bytes = await readLimited(req, opts.maxBodyBytes ?? DEFAULT_MAX_BODY);
        let json: unknown;
        try {
          json = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          throw new HttpError(400, 'invalid', 'body is not valid JSON');
        } finally {
          bytes.fill(0);
        }
        const b = def.body.safeParse(json);
        if (!b.success) throw invalid(b.error, 'body');
        body = b.data;
      } else if (def.rawBody) {
        const contentType = (req.headers.get('content-type') ?? '').split(';')[0]!.trim();
        if (!def.rawBody.contentTypes.includes(contentType.toLowerCase())) {
          throw new HttpError(415, 'unsupported_media_type', 'unsupported content type');
        }
        raw = { bytes: await readLimited(req, def.rawBody.maxBytes), contentType };
      }

      const result = await fn({
        req,
        container,
        ports,
        actor,
        params,
        query,
        body,
        raw,
      } as HandlerContext<D>);
      if (result instanceof Response) return withNoStore(result);
      if (!def.response) throw new Error('route has no response schema');
      return Response.json(z.encode(def.response, result), { headers: NO_STORE });
    } catch (e) {
      if (e instanceof HttpError) return errorResponse(e.status, e.code, e.message, {}, e.headers);
      const mapped = domainErrorResponse(e);
      if (mapped) return mapped;
      ports.telemetry.error({
        code: 'internal',
        route: def.path,
        errorName: e instanceof Error ? e.name : 'unknown',
      });
      return errorResponse(500, 'internal', 'internal error');
    }
  };
}

/** Streams an async iterable of text as `text/plain`. Errors before the first chunk become 502. */
export async function streamText(iterable: AsyncIterable<string>): Promise<Response> {
  const it = iterable[Symbol.asyncIterator]();
  const enc = new TextEncoder();
  let first: IteratorResult<string>;
  try {
    first = await it.next();
  } catch (e) {
    if (isDomainError(e)) throw e;
    throw new DomainError('provider_error', 'provider failed');
  }
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      if (first.done) c.close();
      else c.enqueue(enc.encode(first.value));
    },
    async pull(c) {
      try {
        const next = await it.next();
        if (next.done) c.close();
        else c.enqueue(enc.encode(next.value));
      } catch {
        c.error(new Error('provider stream failed'));
      }
    },
    async cancel() {
      await it.return?.();
    },
  });
  return new Response(first.done ? '' : stream, {
    headers: {
      ...NO_STORE,
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * For paths that share one URL between several contract routes (device-link POST): picks the
 * route by the body's `action` without consuming the original body.
 */
export async function peekJsonField(req: Request, field: string): Promise<unknown> {
  try {
    const bytes = await readLimited(req.clone(), 64 * 1024);
    const json = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    return json?.[field];
  } catch {
    return undefined;
  }
}
