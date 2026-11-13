import { z } from 'zod';
import { defineRoute } from '../route';

/** Plaintext policy: holds no content. Null keeps calls forever. */
const Retention = z.object({ retentionDays: z.number().int().min(1).max(36_500).nullable() });

export const getRetention = defineRoute({
  method: 'GET',
  path: '/api/settings/retention',
  auth: 'session',
  response: Retention,
});

export const putRetention = defineRoute({
  method: 'PUT',
  path: '/api/settings/retention',
  auth: 'session',
  body: Retention,
  response: Retention,
});

const Consent = z.object({ productEvents: z.boolean(), errorReports: z.boolean() });

/** Telemetry opt-ins stored on the account (spec 11.3a). Off by default. */
export const setTelemetryConsent = defineRoute({
  method: 'POST',
  path: '/api/telemetry/consent',
  auth: 'session',
  body: Consent,
  response: Consent,
});

/**
 * Own-key origins for this browser's CSP (spec 2.4, 11.2a): provider ids and custom origins
 * (own bucket, OpenAI-compatible base URL). The server answers with an HttpOnly cookie signed
 * for this user, which the middleware trusts for `connect-src`; empty lists clear it.
 * `changed` says whether the current page's CSP is now stale.
 */
export const putDirectAccess = defineRoute({
  method: 'PUT',
  path: '/api/settings/direct-access',
  auth: 'session',
  body: z.object({
    providers: z.array(z.string().max(32)).max(8),
    origins: z.array(z.string().max(512)).max(8),
  }),
  response: z.object({ changed: z.boolean() }),
});
