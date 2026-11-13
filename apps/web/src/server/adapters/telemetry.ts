import { noTelemetry } from '@askcalls/adapter-runtime';
import { createOtelSink } from '@askcalls/adapter-telemetry-otel';
import { createPostHogSink, POSTHOG_DEFAULT_HOST } from '@askcalls/adapter-telemetry-posthog';
import { createSentrySink } from '@askcalls/adapter-telemetry-sentry';
import { createUmamiSink, UMAMI_DEFAULT_HOST } from '@askcalls/adapter-telemetry-umami';
import * as account from '@askcalls/api-contract/routes/account';
import * as admin from '@askcalls/api-contract/routes/admin';
import * as audit from '@askcalls/api-contract/routes/audit';
import * as calls from '@askcalls/api-contract/routes/calls';
import * as cron from '@askcalls/api-contract/routes/cron';
import * as devices from '@askcalls/api-contract/routes/devices';
import * as health from '@askcalls/api-contract/routes/health';
import * as inbox from '@askcalls/api-contract/routes/inbox';
import * as keyring from '@askcalls/api-contract/routes/keyring';
import * as providers from '@askcalls/api-contract/routes/providers';
import * as search from '@askcalls/api-contract/routes/search';
import * as settings from '@askcalls/api-contract/routes/settings';
import * as setup from '@askcalls/api-contract/routes/setup';
import * as telemetry from '@askcalls/api-contract/routes/telemetry';
import * as tokens from '@askcalls/api-contract/routes/tokens';
import * as userdata from '@askcalls/api-contract/routes/userdata';
import * as vocab from '@askcalls/api-contract/routes/vocab';
import type { Telemetry } from '@askcalls/domain';
import { scrubbedTelemetry, type TelemetrySink } from '@askcalls/domain/telemetry';
import { MARKETING_PATHS } from '../../app/(marketing)/_data/routes';
import { MCP_PATH } from '../../app/api/mcp/resource';
import type { InstanceConfig } from '../config/schema';
import { assertLocalTarget } from '../http/offline-fetch';
import { AdapterUnavailableError } from './errors';

const ROUTE_MODULES = [
  account,
  admin,
  audit,
  calls,
  cron,
  devices,
  health,
  inbox,
  keyring,
  providers,
  search,
  settings,
  setup,
  telemetry,
  tokens,
  userdata,
  vocab,
];

/**
 * The route names telemetry may carry: every API route template (`/api/calls/:id`), the remote
 * MCP endpoint and the marketing pages. A route outside this set never reaches a backend.
 */
export const TELEMETRY_ROUTES: ReadonlySet<string> = new Set([
  ...ROUTE_MODULES.flatMap((m) =>
    Object.values(m).flatMap((v) =>
      v && typeof v === 'object' && 'path' in v && typeof v.path === 'string' ? [v.path] : [],
    ),
  ),
  MCP_PATH,
  ...MARKETING_PATHS,
]);

function required(value: string | undefined, env: string, backend: string): string {
  if (!value) throw new Error(`${env}: required when TELEMETRY includes ${backend}`);
  return value;
}

function sinkFor(backend: string, config: InstanceConfig, fetchImpl: typeof fetch): TelemetrySink {
  const { otel, sentryDsn, posthog, umami } = config.telemetry;
  switch (backend) {
    case 'otel': {
      const endpoint = required(otel.endpoint, 'OTEL_EXPORTER_OTLP_ENDPOINT', backend);
      assertLocalTarget(config.offlineMode, endpoint);
      return createOtelSink({
        endpoint,
        ...(otel.headers && { headers: otel.headers }),
        fetch: fetchImpl,
      });
    }
    case 'sentry': {
      const dsn = required(sentryDsn, 'SENTRY_DSN', backend);
      assertLocalTarget(config.offlineMode, dsn);
      return createSentrySink({ dsn, fetch: fetchImpl });
    }
    case 'posthog': {
      const apiKey = required(posthog.key, 'POSTHOG_KEY', backend);
      assertLocalTarget(config.offlineMode, posthog.host ?? POSTHOG_DEFAULT_HOST);
      return createPostHogSink({
        apiKey,
        ...(posthog.host && { host: posthog.host }),
        fetch: fetchImpl,
      });
    }
    case 'umami': {
      const websiteId = required(umami.websiteId, 'UMAMI_WEBSITE_ID', backend);
      assertLocalTarget(config.offlineMode, umami.host ?? UMAMI_DEFAULT_HOST);
      return createUmamiSink({
        websiteId,
        hostname: new URL(config.appUrl).hostname,
        ...(umami.host && { host: umami.host }),
        fetch: fetchImpl,
      });
    }
    default:
      throw new AdapterUnavailableError('telemetry', backend);
  }
}

/**
 * TELEMETRY (comma list) → one sink per backend, fanned out behind the shared scrubber
 * (spec 11.3a). Empty means none. In offline mode every backend must be on the local network.
 */
export async function buildTelemetry(
  config: InstanceConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<Telemetry> {
  const backends = [...new Set(config.telemetry.backends)];
  if (backends.length === 0) return noTelemetry;
  const sinks = backends.map((b) => sinkFor(b, config, fetchImpl));
  return scrubbedTelemetry(sinks, { isRoute: (r) => TELEMETRY_ROUTES.has(r) });
}
