import { checkCorsByPreflight, corsJson, S3BlobStore } from '@askcalls/adapter-blob-s3';
import type { HealthResult } from '@askcalls/domain';
import { buildBlobStore } from '../adapters/blob';
import { buildLlm } from '../adapters/llm';
import { buildTranscription } from '../adapters/transcription';
import { offlineBlockers } from '../config/offline';
import type { InstanceConfig } from '../config/schema';
import { assertLocalTarget, guardedFetch, OfflineBlockedError } from '../http/offline-fetch';

export type TestPort = 'database' | 'blob' | 'transcription' | 'llm';

export interface ConnectionTestResult {
  ok: boolean;
  /** Content-free outcome: "connected", "invalid API key", "unreachable", "offline_blocked". */
  message: string;
  latencyMs: number | null;
  /** Postgres: server and pgvector versions. */
  postgres?: { version: string; vector: string | null; vectorAvailable: boolean };
  /** S3: whether browsers on this instance's origin may upload, and the rule to paste. */
  cors?: { status: 'ok' | 'missing' | 'unknown'; fixJson: string | null };
}

const TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function fromHealth(h: HealthResult, started: number): ConnectionTestResult {
  return {
    ok: h.ok,
    message: h.message,
    latencyMs: h.latencyMs ?? Math.round(performance.now() - started),
  };
}

function failure(e: unknown): ConnectionTestResult {
  if (e instanceof OfflineBlockedError) {
    return { ok: false, message: 'offline_blocked', latencyMs: null };
  }
  const msg = e instanceof Error ? e.message : '';
  const message =
    msg === 'timeout' ? 'timeout' : /required/.test(msg) ? 'incomplete' : 'unreachable';
  return { ok: false, message, latencyMs: null };
}

/**
 * "Test connection" (spec 3.5): builds the adapter for `port` from the proposed config, runs
 * its health check and throws it away. Nothing is saved. `running` is the config the
 * instance runs with now: an embedded database already open is reported, not reopened.
 */
export async function testConnection(
  port: TestPort,
  config: InstanceConfig,
  running: InstanceConfig | null,
): Promise<ConnectionTestResult> {
  const started = performance.now();
  if (config.offlineMode && offlineBlockers(config).some((b) => b.id === port)) {
    return { ok: false, message: 'offline_blocked', latencyMs: null };
  }
  try {
    switch (port) {
      case 'database': {
        if (config.db.driver !== 'postgres') {
          return { ok: true, message: config.db.driver, latencyMs: 0 };
        }
        if (!config.db.url) return { ok: false, message: 'missing_url', latencyMs: null };
        assertLocalTarget(config.offlineMode, config.db.url);
        const { createPostgresDatabase } = await import('@askcalls/adapter-db-postgres');
        const db = await withTimeout(createPostgresDatabase({ driver: 'pg', url: config.db.url }));
        try {
          const health = await withTimeout(db.users.healthCheck());
          if (!health.ok) return fromHealth(health, started);
          const postgres = await withTimeout(db.serverInfo());
          return { ...fromHealth(health, started), postgres };
        } finally {
          await db.close();
        }
      }
      case 'blob': {
        if (
          config.blob.driver === 'fs' &&
          running?.blob.driver === 'fs' &&
          running.blob.fsDir === config.blob.fsDir
        ) {
          return { ok: true, message: 'in use', latencyMs: 0 };
        }
        const store = await buildBlobStore(config);
        const health = await withTimeout(store.healthCheck());
        const result = fromHealth(health, started);
        if (!health.ok || !(store instanceof S3BlobStore)) return result;
        const origin = new URL(config.appUrl).origin;
        const cors = await withTimeout(
          checkCorsByPreflight(store, origin, guardedFetch(config.offlineMode)),
        ).catch(() => ({ status: 'unknown' as const }));
        return {
          ...result,
          cors: {
            status: cors.status,
            fixJson: cors.status === 'ok' ? null : corsJson([origin]),
          },
        };
      }
      case 'transcription': {
        const provider = await buildTranscription(config, guardedFetch(config.offlineMode));
        if (!provider) return { ok: true, message: 'off', latencyMs: 0 };
        return fromHealth(await withTimeout(provider.healthCheck()), started);
      }
      case 'llm': {
        const llm = await buildLlm(config, guardedFetch(config.offlineMode));
        if (!llm) return { ok: true, message: 'off', latencyMs: 0 };
        return fromHealth(await withTimeout(llm.healthCheck()), started);
      }
    }
  } catch (e) {
    return failure(e);
  }
}
