import { type DomainErrorCode, isDomainError } from '@askcalls/domain';

export const STATUS: Record<DomainErrorCode, number> = {
  invalid: 400,
  unauthorized: 401,
  forbidden: 403,
  quota_exceeded: 403,
  not_found: 404,
  unsupported: 404,
  conflict: 409,
  duplicate: 409,
  version_conflict: 409,
  rate_limited: 429,
  provider_error: 502,
};

type Details = Record<string, string | number | boolean | null>;

export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** Content-free JSON error. `message` and `details` never carry user content. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  details: Details = {},
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { error: { code, message, ...(Object.keys(details).length && { details }) } },
    { status, headers: { ...NO_STORE, ...headers } },
  );
}

export function domainErrorResponse(e: unknown): Response | null {
  if (!isDomainError(e)) return null;
  const headers: Record<string, string> = {};
  const retry = e.details.retryAfterSec;
  if (typeof retry === 'number') headers['Retry-After'] = String(Math.max(1, Math.ceil(retry)));
  return errorResponse(STATUS[e.code], e.code, e.message, e.details, headers);
}
