import type { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** `session` = browser session only; otherwise a token with this scope (or a session) works. */
export type RouteAuth = 'session' | 'read' | 'write' | 'ask' | 'keys' | 'public' | 'cron';

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
}

/**
 * Declares a route. Each route lives in its own file under src/routes/ and is the single
 * source of truth for the server handler and the typed client.
 */
export function defineRoute<
  P extends z.ZodType,
  Q extends z.ZodType,
  B extends z.ZodType,
  R extends z.ZodType,
>(def: RouteDef<P, Q, B, R>): RouteDef<P, Q, B, R> {
  return def;
}

export function buildPath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/:([A-Za-z]+)/g, (_, k: string) => {
    const v = params[k];
    if (v === undefined) throw new Error(`missing path param ${k}`);
    return encodeURIComponent(v);
  });
}
