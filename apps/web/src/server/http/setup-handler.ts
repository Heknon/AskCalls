import { MemoryRateLimiter } from '@askcalls/adapter-mocks';
import type { RouteDef } from '@askcalls/api-contract';
import type { ResponseFor } from '@askcalls/api-contract/client';
import { z } from 'zod';
import { ConfigError } from '../config/config-service';
import type { SetupToken } from '../config/setup-token';
import { getSetupToken } from '../container';
import { domainErrorResponse, errorResponse, NO_STORE } from './errors';
import type { NextHandler } from './handler';

// Setup runs before there is a database, so its rate limits live in this process.
const limiter = new MemoryRateLimiter();
const MAX_BODY = 64 * 1024;

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

/**
 * Setup-wizard routes: open only while the instance needs setup (404 after), 30 requests a
 * minute per address, and every one carries the setup token (401 without it). Bodies are
 * never logged.
 */
export function setupRoute<const D extends RouteDef & { body: z.ZodType }>(
  def: D,
  fn: (body: z.output<D['body']>, token: SetupToken, req: Request) => Promise<ResponseFor<D>>,
): NextHandler {
  return async (req) => {
    const token = await getSetupToken().catch(() => null);
    if (!token) return errorResponse(404, 'not_found', 'this instance is already set up');
    const rl = await limiter.hit(`setup:${clientIp(req)}`, 30, 60_000);
    if (!rl.allowed) {
      return errorResponse(429, 'rate_limited', 'too many requests', {}, { 'Retry-After': '60' });
    }
    const declared = Number(req.headers.get('content-length') ?? 0);
    const text = declared > MAX_BODY ? null : await req.text();
    if (text === null || text.length > MAX_BODY) {
      return errorResponse(413, 'payload_too_large', 'request body is too large');
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return errorResponse(400, 'invalid', 'body is not valid JSON');
    }
    const parsed = def.body.safeParse(json);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join('.')).slice(0, 5);
      return errorResponse(400, 'invalid', `invalid body: ${fields.join(', ')}`);
    }
    const body = parsed.data as z.output<D['body']> & { token: string };
    if (!token.verify(body.token)) {
      return errorResponse(401, 'unauthorized', 'the setup token is not valid');
    }
    try {
      const result = await fn(body, token, req);
      return Response.json(z.encode(def.response!, result), { headers: NO_STORE });
    } catch (e) {
      if (e instanceof ConfigError) {
        return errorResponse(400, 'invalid', e.problems.join('; ').slice(0, 500));
      }
      return domainErrorResponse(e) ?? errorResponse(500, 'internal', 'internal error');
    }
  };
}
