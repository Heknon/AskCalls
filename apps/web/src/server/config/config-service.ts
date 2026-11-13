import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { offlineBlockers } from './offline';
import { ENV_BINDINGS, type InstanceConfig, InstanceConfigSchema, SECRET_PATHS } from './schema';

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

type Json = Record<string, unknown>;

function setPath(obj: Json, path: string, value: unknown) {
  const keys = path.split('.');
  let cur = obj;
  for (const k of keys.slice(0, -1)) {
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k] as Json;
  }
  cur[keys.at(-1)!] = value;
}

function getPath(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const k of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Json)[k];
  }
  return cur;
}

/** Merges `over` into `base`; arrays replace, and `null` removes a setting. */
function deepMerge(base: Json, over: Json): Json {
  const out: Json = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === null) {
      delete out[k];
      continue;
    }
    const b = out[k];
    out[k] =
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      b &&
      typeof b === 'object' &&
      !Array.isArray(b)
        ? deepMerge(b as Json, v as Json)
        : v;
  }
  return out;
}

export const expandHome = (p: string) => (p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);

/** Mode-dependent defaults applied under the file and env layers. */
function modeDefaults(env: Record<string, string | undefined>): Json {
  if (env.APP_MODE === 'local') {
    return {
      dataDir: '~/.askcalls',
      db: { driver: 'pglite' },
      blob: { driver: 'fs', fsDir: '~/.askcalls/blobs' },
      transcription: { provider: 'none' },
      llm: { provider: 'none' },
    };
  }
  return env.VERCEL ? { scheduler: 'vercel-cron' } : {};
}

export interface ResolvedConfig {
  config: InstanceConfig;
  /** Config paths set by env vars: read-only in the admin UI. */
  locked: ReadonlySet<string>;
  /** Missing settings the first-run wizard must fill in before adapters can be built. */
  incomplete: string[];
  /** Monotonic version, bumped on every successful update. */
  version: number;
  /** NODE_ENV of the running server. Production fails closed where a secret is missing. */
  environment: 'production' | 'development' | 'test';
}

type Listener = (next: ResolvedConfig) => void;

/**
 * Resolution order for every setting: env var (locked) → instance config file → default.
 * The only code that reads env vars or config.json.
 */
export class ConfigService {
  private current: ResolvedConfig | null = null;
  private fileLayer: Json = {};
  private listeners = new Set<Listener>();

  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  private envLayer(): { layer: Json; locked: Set<string>; problems: string[] } {
    const layer: Json = {};
    const locked = new Set<string>();
    const problems: string[] = [];
    for (const [name, path, parse] of ENV_BINDINGS) {
      const raw = this.env[name];
      if (raw === undefined || raw === '') continue;
      try {
        setPath(layer, path, parse(raw));
        locked.add(path);
      } catch (e) {
        problems.push(`${name}: ${(e as Error).message}`);
      }
    }
    return { layer, locked, problems };
  }

  get environment(): ResolvedConfig['environment'] {
    const env = this.env.NODE_ENV;
    return env === 'development' || env === 'test' ? env : 'production';
  }

  /** Where config.json and the setup token live. */
  get dataDir(): string {
    return dirname(this.configFilePath);
  }

  get configFilePath(): string {
    const dataDir =
      this.env.ASKCALLS_DATA_DIR ?? (this.env.APP_MODE === 'local' ? '~/.askcalls' : './data');
    return resolve(expandHome(dataDir), 'config.json');
  }

  private resolveLayers(fileLayer: Json): ResolvedConfig {
    const { layer, locked, problems } = this.envLayer();
    const merged = deepMerge(deepMerge(modeDefaults(this.env), fileLayer), layer);
    const parsed = InstanceConfigSchema.safeParse(merged);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        const envName = ENV_BINDINGS.find(([, p]) => p === path)?.[0];
        problems.push(`${envName ?? path}: ${issue.message}`);
      }
    }
    if (problems.length) throw new ConfigError(problems);
    const config = parsed.data!;
    const incomplete: string[] = [];
    for (const p of validateCombination(config)) {
      // A combination problem caused by env vars is an operator error: fail fast.
      // Otherwise the instance boots into the first-run wizard to fill it in.
      if (p.paths.some((path) => locked.has(path))) problems.push(p.message);
      else incomplete.push(p.message);
    }
    if (problems.length) throw new ConfigError(problems);
    return {
      config,
      locked,
      incomplete,
      version: (this.current?.version ?? 0) + 1,
      environment: this.environment,
    };
  }

  /** Loads env and the config file. Invalid env values fail fast with every problem listed. */
  async load(): Promise<ResolvedConfig> {
    try {
      this.fileLayer = JSON.parse(await readFile(this.configFilePath, 'utf8')) as Json;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new ConfigError([`${this.configFilePath}: ${(e as Error).message}`]);
      }
      this.fileLayer = {};
    }
    this.current = this.resolveLayers(this.fileLayer);
    return this.current;
  }

  /** Synchronous resolve from env only, for build-time and tests. */
  loadFromEnvOnly(): ResolvedConfig {
    this.current = this.resolveLayers({});
    return this.current;
  }

  get(): ResolvedConfig {
    if (!this.current) throw new Error('ConfigService.load() has not run');
    return this.current;
  }

  /** True when the config file has never been written (first-run wizard). */
  get isFresh(): boolean {
    return Object.keys(this.fileLayer).length === 0;
  }

  /**
   * Validates a patch from the admin UI or the setup wizard without saving it: rejects hosted
   * instances, env-locked paths and any result that would not boot (an incomplete combination).
   */
  preview(patch: Json, opts: { allowIncomplete?: boolean } = {}): ResolvedConfig {
    const cur = this.get();
    if (cur.config.hosted)
      throw new ConfigError(['this instance is hosted; its configuration is locked']);
    const blocked = flattenPaths(patch).filter((p) => cur.locked.has(p));
    if (blocked.length)
      throw new ConfigError(blocked.map((p) => `${p}: set by the server environment`));
    const next = this.resolveLayers(deepMerge(this.fileLayer, patch));
    if (next.incomplete.length && !opts.allowIncomplete) throw new ConfigError(next.incomplete);
    return next;
  }

  /**
   * Applies a validated patch (see `preview`), writes config.json with owner-only permissions,
   * then notifies listeners.
   */
  async update(patch: Json): Promise<ResolvedConfig> {
    const next = this.preview(patch);
    const nextFile = deepMerge(this.fileLayer, patch);
    await writeConfigFile(this.configFilePath, nextFile);
    this.fileLayer = nextFile;
    this.current = next;
    for (const l of this.listeners) l(next);
    return next;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * The config as the admin UI may see it: every secret removed (`secrets` lists the ones that
   * are set), and the Postgres URL without its password.
   */
  redacted(): { config: Json; locked: string[]; secrets: string[] } {
    const { config, locked } = this.get();
    const copy = structuredClone(config) as Json;
    const secrets: string[] = [];
    for (const path of SECRET_PATHS) {
      if (getPath(copy, path) === undefined) continue;
      secrets.push(path);
      deletePath(copy, path);
    }
    if (config.db.url) setPath(copy, 'db.urlDisplay', withoutPassword(config.db.url));
    return { config: copy, locked: [...locked], secrets };
  }
}

function deletePath(obj: Json, path: string) {
  const keys = path.split('.');
  const parent = getPath(obj, keys.slice(0, -1).join('.'));
  if (parent && typeof parent === 'object') delete (parent as Json)[keys.at(-1)!];
}

/** `postgres://user:secret@host/db` → `postgres://user@host/db`. */
export function withoutPassword(url: string): string {
  try {
    const u = new URL(url);
    u.password = '';
    return u.toString();
  } catch {
    return '';
  }
}

function flattenPaths(obj: Json, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const p = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' && !Array.isArray(v) ? flattenPaths(v as Json, p) : [p];
  });
}

async function writeConfigFile(path: string, data: Json) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}

export interface CombinationProblem {
  /** Config paths involved; if any is env-locked the problem is fatal at boot. */
  paths: string[];
  message: string;
}

/** Cross-field rules, including offline mode: nothing may point outside the local network. */
export function validateCombination(c: InstanceConfig): CombinationProblem[] {
  const out: CombinationProblem[] = [];
  if (c.db.driver === 'postgres' && !c.db.url) {
    out.push({
      paths: ['db.driver', 'db.url'],
      message: 'DATABASE_URL: required when DB_DRIVER=postgres',
    });
  }
  if (c.blob.driver === 's3' && !c.blob.s3.bucket) {
    out.push({
      paths: ['blob.driver', 'blob.s3.bucket'],
      message: 'S3_BUCKET: required when BLOB_DRIVER=s3',
    });
  }
  if (c.offlineMode && !c.auth.localAccounts && c.appMode !== 'local') {
    out.push({
      paths: ['offlineMode', 'auth.localAccounts'],
      message: 'AUTH_LOCAL_ACCOUNTS: must be true when OFFLINE_MODE=true',
    });
  }
  if (c.hosted && c.offlineMode) {
    out.push({
      paths: ['hosted', 'offlineMode'],
      message: 'OFFLINE_MODE: not available on the hosted instance',
    });
  }
  if (c.offlineMode) {
    for (const b of offlineBlockers(c)) {
      if (b.id === 'local-accounts') continue;
      out.push({
        paths: ['offlineMode', ...b.paths],
        message: `OFFLINE_MODE: ${b.paths[0]} reaches ${b.host}, outside the local network`,
      });
    }
  }
  return out;
}
