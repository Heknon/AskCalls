import { corsJson } from '@askcalls/adapter-blob-s3';
import { DomainError, type HealthResult, isDomainError } from '@askcalls/domain';
import { instanceUsage } from '@askcalls/domain/use-cases/admin';
import type { Actor } from '@askcalls/domain/use-cases/context';
import pkg from '../../../package.json' with { type: 'json' };
import { AdapterUnavailableError } from '../adapters/errors';
import { ConfigError, type ConfigService } from '../config/config-service';
import { type OfflineBlocker, offlineBlockers } from '../config/offline';
import type { Container } from '../container';
import { OfflineBlockedError } from '../http/offline-fetch';

export type HealthStatus = 'healthy' | 'degraded' | 'down';

export interface PortHealth {
  status: HealthStatus;
  message: string;
  latencyMs: number | null;
}

export interface InstanceView {
  version: string;
  hosted: boolean;
  environment: 'production' | 'development' | 'test';
  config: Record<string, unknown>;
  locked: string[];
  env: Record<string, string>;
  secrets: string[];
  restartRequired: string[];
  offline: {
    enabled: boolean;
    /** OFFLINE_MODE is set by env: the switch is hidden. */
    locked: boolean;
    blockers: OfflineBlocker[];
  };
  health: {
    database: PortHealth;
    blob: PortHealth;
    transcription: PortHealth | null;
    llm: PortHealth | null;
  };
  usage: { users: number; databaseEmpty: boolean };
  /** The CORS rule an S3 bucket needs for this instance's origin. */
  corsJson: string | null;
}

const SLOW_MS = 2_000;
const HEALTH_TIMEOUT_MS = 3_000;
const HEALTH_TTL_MS = 15_000;

async function probe(check: () => Promise<HealthResult>): Promise<PortHealth> {
  const started = performance.now();
  try {
    const h = await Promise.race([
      check(),
      new Promise<HealthResult>((resolve) =>
        setTimeout(() => resolve({ ok: false, message: 'timeout' }), HEALTH_TIMEOUT_MS),
      ),
    ]);
    const latencyMs = h.ok ? (h.latencyMs ?? Math.round(performance.now() - started)) : null;
    return {
      status: !h.ok ? 'down' : (latencyMs ?? 0) > SLOW_MS ? 'degraded' : 'healthy',
      message: h.message,
      latencyMs,
    };
  } catch {
    return { status: 'down', message: 'unreachable', latencyMs: null };
  }
}

const cache = new WeakMap<Container, { at: number; health: Promise<InstanceView['health']> }>();

/** Live health of every port, cached briefly so the page doesn't hammer providers. */
export function liveHealth(container: Container, fresh = false): Promise<InstanceView['health']> {
  const hit = cache.get(container);
  if (hit && !fresh && Date.now() - hit.at < HEALTH_TTL_MS) return hit.health;
  const { ports } = container;
  const health = Promise.all([
    probe(() => ports.users.healthCheck()),
    probe(() => ports.blobs.healthCheck()),
    ports.transcription ? probe(() => ports.transcription!.healthCheck()) : null,
    ports.llm ? probe(() => ports.llm!.healthCheck()) : null,
  ]).then(([database, blob, transcription, llm]) => ({ database, blob, transcription, llm }));
  cache.set(container, { at: Date.now(), health });
  return health;
}

/** Everything /admin/instance shows. Never includes a secret value. */
export async function instanceView(
  container: Container,
  configService: ConfigService,
  actor: Actor,
  opts: { freshHealth?: boolean } = {},
): Promise<InstanceView> {
  const usage = await instanceUsage(container.ports, actor);
  const resolved = configService.get();
  const { config, locked, env, secrets } = configService.redacted();
  const lockedSet = new Set(locked);
  const blob = resolved.config.blob;
  return {
    version: pkg.version,
    hosted: resolved.config.hosted,
    environment: resolved.environment,
    config,
    locked,
    env,
    secrets,
    restartRequired: container.restartRequired,
    offline: {
      enabled: resolved.config.offlineMode,
      locked: lockedSet.has('offlineMode'),
      blockers: resolved.config.offlineMode ? [] : offlineBlockers(resolved.config, lockedSet),
    },
    health: await liveHealth(container, opts.freshHealth),
    usage,
    corsJson: blob.driver === 's3' ? corsJson([new URL(resolved.config.appUrl).origin]) : null,
  };
}

/**
 * A config the instance can't run with → 400. ConfigError lists paths and env names; an
 * adapter that refuses to build says which setting it needs. Never values.
 */
export function configProblem(e: unknown): never {
  if (e instanceof ConfigError) {
    throw new DomainError('invalid', e.problems.join('; ').slice(0, 500));
  }
  if (e instanceof AdapterUnavailableError || e instanceof OfflineBlockedError) {
    throw new DomainError('invalid', e.message);
  }
  if (e instanceof Error && !isDomainError(e) && /required/.test(e.message)) {
    throw new DomainError('invalid', e.message.slice(0, 200));
  }
  throw e;
}

/**
 * Settings that only change in a full config document: the database switch is allowed only
 * while the database is empty (spec 11.2b), and offline mode only with no blockers.
 */
export function guardPatch(
  patch: Record<string, unknown>,
  view: Pick<InstanceView, 'usage'>,
  configService: ConfigService,
): void {
  const db = patch.db as Record<string, unknown> | undefined;
  if (db && Object.keys(db).length && !view.usage.databaseEmpty) {
    throw new DomainError('conflict', 'the database holds data; use askcalls backup and restore');
  }
  if (patch.offlineMode === true && !configService.get().config.offlineMode) {
    const next = configService.preview(patch, { allowIncomplete: true });
    const blockers = offlineBlockers(next.config).filter((b) => b.id !== 'local-accounts');
    if (blockers.length || !next.config.auth.localAccounts) {
      throw new DomainError('conflict', 'settings still reach the internet', {
        blockers: blockers.length,
      });
    }
  }
}
