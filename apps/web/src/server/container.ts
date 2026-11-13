import { noBilling, systemClock, systemIds } from '@askcalls/adapter-runtime';
import { DEFAULT_LIMITS, type Ports } from '@askcalls/domain';
import { buildBlobStore } from './adapters/blob';
import { buildDatabase } from './adapters/database';
import { buildLlm } from './adapters/llm';
import { buildScheduler } from './adapters/scheduler';
import { buildTelemetry } from './adapters/telemetry';
import { buildTranscription } from './adapters/transcription';
import { ConfigService, type ResolvedConfig } from './config/config-service';

/**
 * Composition root (spec 3.1). Gets resolved config from ConfigService and wires adapters into
 * the Ports bundle. Rebuilds when the config changes. Nothing else constructs adapters.
 */
export interface Container {
  config: ResolvedConfig;
  ports: Ports;
  close(): Promise<void>;
}

export class SetupRequiredError extends Error {
  constructor(readonly missing: string[]) {
    super('This instance needs setup');
    this.name = 'SetupRequiredError';
  }
}

export async function buildContainer(resolved: ResolvedConfig): Promise<Container> {
  if (resolved.incomplete.length) throw new SetupRequiredError(resolved.incomplete);
  const { config } = resolved;
  const [db, blobs, transcription, llm, telemetry] = await Promise.all([
    buildDatabase(config),
    buildBlobStore(config),
    buildTranscription(config),
    buildLlm(config),
    buildTelemetry(config),
  ]);
  const scheduler = buildScheduler(config);
  const { close: closeDb, ...repos } = db;
  const ports: Ports = {
    ...repos,
    blobs,
    transcription,
    llm,
    telemetry,
    billing: noBilling,
    scheduler,
    clock: systemClock,
    ids: systemIds,
    limits: { ...DEFAULT_LIMITS, maxCalls: config.limits.freeTierMaxCalls },
  };
  return {
    config: resolved,
    ports,
    close: async () => {
      scheduler.stop();
      await telemetry.flush();
      await closeDb();
    },
  };
}

interface Runtime {
  configService: ConfigService;
  container: Promise<Container>;
}

// Survives Next.js dev reloads; one runtime per server process.
const g = globalThis as typeof globalThis & { __askcalls?: Runtime };

async function boot(): Promise<Runtime> {
  const configService = new ConfigService();
  const resolved = await configService.load();
  const runtime: Runtime = { configService, container: buildContainer(resolved) };
  configService.subscribe((next) => {
    const previous = runtime.container;
    const rebuilt = buildContainer(next);
    // Swap only when the new container is ready; keep serving with the old one meanwhile.
    rebuilt.then(
      async (c) => {
        runtime.container = Promise.resolve(c);
        await (await previous.catch(() => null))?.close();
      },
      () => {},
    );
  });
  return runtime;
}

let booting: Promise<Runtime> | null = null;

async function runtime(): Promise<Runtime> {
  if (g.__askcalls) return g.__askcalls;
  booting ??= boot().then((r) => {
    g.__askcalls = r;
    return r;
  });
  return booting;
}

export async function getContainer(): Promise<Container> {
  return (await runtime()).container;
}

export async function getConfigService(): Promise<ConfigService> {
  return (await runtime()).configService;
}
