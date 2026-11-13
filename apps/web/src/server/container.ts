import { noBilling, systemClock, systemIds } from '@askcalls/adapter-runtime';
import { DEFAULT_LIMITS, type Ports } from '@askcalls/domain';
import { buildBlobStore } from './adapters/blob';
import { buildDatabase, type DatabasePorts } from './adapters/database';
import { buildLlm } from './adapters/llm';
import { buildScheduler } from './adapters/scheduler';
import { buildTelemetry } from './adapters/telemetry';
import { buildTranscription } from './adapters/transcription';
import { ConfigService, type ResolvedConfig } from './config/config-service';
import type { InstanceConfig } from './config/schema';
import { SetupToken } from './config/setup-token';
import { guardedFetch } from './http/offline-fetch';
import { registerJobs } from './jobs';

/**
 * Composition root (spec 3.1). Gets resolved config from ConfigService and wires adapters into
 * the Ports bundle. Rebuilds when the config changes. Nothing else constructs adapters.
 */
export interface Container {
  config: ResolvedConfig;
  ports: Ports;
  /** Settings saved but not applied until the next start (the database). */
  restartRequired: string[];
  close(opts?: { keepDatabase?: boolean }): Promise<void>;
}

interface Built extends Container {
  database: DatabasePorts;
  dbConfig: InstanceConfig['db'];
}

export class SetupRequiredError extends Error {
  constructor(readonly missing: string[]) {
    super('This instance needs setup');
    this.name = 'SetupRequiredError';
  }
}

const sameDb = (a: InstanceConfig['db'], b: InstanceConfig['db']) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Builds every adapter from `resolved`. With `previous`, the running database is kept: a
 * database change only takes effect on the next start (it is listed in `restartRequired`).
 */
export async function buildContainer(
  resolved: ResolvedConfig,
  previous?: Container | null,
): Promise<Container> {
  if (resolved.incomplete.length) throw new SetupRequiredError(resolved.incomplete);
  const { config } = resolved;
  const prev = previous && 'database' in previous ? (previous as Built) : null;
  const http = guardedFetch(config.offlineMode);
  const [db, blobs, transcription, llm, telemetry] = await Promise.all([
    prev ? Promise.resolve(prev.database) : buildDatabase(config),
    buildBlobStore(config),
    buildTranscription(config, http),
    buildLlm(config, http),
    buildTelemetry(config),
  ]);
  const dbConfig = prev ? prev.dbConfig : config.db;
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
  registerJobs(ports);
  const built: Built = {
    config: resolved,
    ports,
    database: db,
    dbConfig,
    restartRequired: sameDb(dbConfig, config.db) ? [] : ['db'],
    close: async (opts = {}) => {
      scheduler.stop();
      await telemetry.flush();
      if (!opts.keepDatabase) await closeDb();
    },
  };
  return built;
}

interface Runtime {
  configService: ConfigService;
  container: Promise<Container>;
  /** Present while the instance has no config and needs the first-run wizard. */
  setup: SetupToken | null;
  /** A container built ahead of a config write, picked up by the change listener. */
  prebuilt: Container | null;
}

// Survives Next.js dev reloads; one runtime per server process.
const g = globalThis as typeof globalThis & { __askcalls?: Runtime };

const start = (c: Promise<Container>) => {
  c.then(
    (ready) => ready.ports.scheduler.start(),
    () => {},
  );
  return c;
};

/** True when a fresh self-hosted instance must go through the wizard (spec 3.5 bootstrap). */
export function needsSetup(service: ConfigService, resolved: ResolvedConfig): boolean {
  const { config } = resolved;
  return (
    service.isFresh &&
    resolved.incomplete.length > 0 &&
    !config.hosted &&
    config.appMode === 'server'
  );
}

async function boot(): Promise<Runtime> {
  const configService = new ConfigService();
  const resolved = await configService.load();
  let setup: SetupToken | null = null;
  if (needsSetup(configService, resolved)) {
    setup = new SetupToken(configService.dataDir);
    await setup.issue(resolved.config.appUrl);
  }
  const runtime: Runtime = {
    configService,
    container: start(buildContainer(resolved)),
    setup,
    prebuilt: null,
  };
  configService.subscribe((next) => {
    const previous = runtime.container;
    const ready = runtime.prebuilt?.config.version === next.version ? runtime.prebuilt : null;
    runtime.prebuilt = null;
    const rebuilt = ready
      ? Promise.resolve(ready)
      : start(previous.catch(() => null).then((p) => buildContainer(next, p)));
    // Swap only when the new container is ready; keep serving with the old one meanwhile.
    rebuilt.then(
      async (c) => {
        runtime.container = Promise.resolve(c);
        if (ready) start(runtime.container);
        const old = await previous.catch(() => null);
        if (old && old !== c) await old.close({ keepDatabase: true });
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

/** The first-run setup token, or null once the instance is set up (or never needed it). */
export async function getSetupToken(): Promise<SetupToken | null> {
  return (await runtime()).setup;
}

/**
 * Validates and applies a config patch: builds the new container first (so a bad setting never
 * reaches config.json), runs `beforeCommit` against it (the wizard creates the admin there),
 * then writes the file and swaps containers. Throws ConfigError or the adapter's error.
 */
export async function applyConfig(
  patch: Record<string, unknown>,
  beforeCommit?: (next: Container) => Promise<void>,
): Promise<Container> {
  const rt = await runtime();
  const next = rt.configService.preview(patch);
  const previous = await rt.container.catch(() => null);
  const built = await buildContainer(next, previous);
  const reused = previous !== null;
  try {
    await beforeCommit?.(built);
    rt.prebuilt = built;
    await rt.configService.update(patch);
  } catch (e) {
    rt.prebuilt = null;
    await built.close({ keepDatabase: reused });
    throw e;
  }
  rt.container = Promise.resolve(built);
  return built;
}

/** Ends setup mode: the token stops working and the file holding it is removed. */
export async function finishSetup(): Promise<void> {
  const rt = await runtime();
  await rt.setup?.consume();
  rt.setup = null;
}

/** Test seam: a container over ready-made ports whose database later rebuilds keep. */
export function containerForTests(resolved: ResolvedConfig, ports: Ports): Container {
  const database = { ...ports, close: async () => {} } as unknown as DatabasePorts;
  const built: Built = {
    config: resolved,
    ports,
    database,
    dbConfig: resolved.config.db,
    restartRequired: [],
    close: async () => {},
  };
  return built;
}

/**
 * Test seam: route-level tests run the real handlers against a container built from mocks.
 * Pass null to drop the override. Not reachable from any route.
 */
export function setContainerForTests(
  container: Container | null,
  opts: { configService?: ConfigService; setup?: SetupToken | null } = {},
): void {
  booting = null;
  if (!container && !opts.configService) {
    delete g.__askcalls;
    return;
  }
  g.__askcalls = {
    configService: opts.configService ?? new ConfigService({}),
    container: container
      ? Promise.resolve(container)
      : Promise.reject(new SetupRequiredError(['test'])),
    setup: opts.setup ?? null,
    prebuilt: null,
  };
  g.__askcalls.container.catch(() => {});
}
