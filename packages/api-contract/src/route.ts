import type { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * `session` = browser session only; `read|write|ask|keys` = a session or a token with that
 * scope; `link` = the device-link one-time secret in the body (spec 6.5); `cron` = Bearer
 * CRON_SECRET; `public` = no auth.
 */
export type RouteAuth = 'session' | 'read' | 'write' | 'ask' | 'keys' | 'link' | 'public' | 'cron';

export interface RouteDef<
  Params extends z.ZodType = z.ZodType,
  Query extends z.ZodType = z.ZodType,
  Body extends z.ZodType = z.ZodType,
  Res extends z.ZodType = z.ZodType,
> {
  method: HttpMethod;
  /** Express-style path, e.g. `/api/calls/:id`. */
  path: string;
  auth: RouteAuth;
  params?: Params;
  query?: Query;
  body?: Body;
  /** Absent for streaming responses. */
  response?: Res;
  /** The response is a `text/plain` stream (no `response` schema). */
  stream?: boolean;
  /** The request body is raw bytes of one of these content types (no `body` schema). */
  rawBody?: { contentTypes: readonly string[]; maxBytes: number };
}

/**
 * Declares a route. Each route lives in its own file under src/routes/ and is the single
 * source of truth for the server handler and the typed client. The exact literal type is kept,
 * so the client knows which of params, query, body and response a route has.
 */
export function defineRoute<const D extends RouteDef>(def: D): D {
  return def;
}

export function buildPath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/:([A-Za-z]+)/g, (_, k: string) => {
    const v = params[k];
    if (v === undefined) throw new Error(`missing path param ${k}`);
    return encodeURIComponent(v);
  });
}
