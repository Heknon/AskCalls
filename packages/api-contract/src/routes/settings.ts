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
