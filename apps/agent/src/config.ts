import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/** Per-session `get_call` limit (spec 10.1). */
export const DEFAULT_DECRYPT_BUDGET = 10;

const AgentConfigSchema = z.object({
  /** Origin of the AskCalls server this agent is logged in to. */
  server: z.url().nullable().default(null),
  /** Calls `get_call` may decrypt in one MCP session. */
  decryptBudget: z.number().int().min(1).max(10_000).default(DEFAULT_DECRYPT_BUDGET),
  /** Name this computer registers under in Settings → Devices. */
  deviceLabel: z.string().min(1).max(100).default('askcalls agent'),
});

export type AgentConfig = z.output<typeof AgentConfigSchema>;

/**
 * The agent's data directory: `~/.askcalls`, or `ASKCALLS_HOME`. It holds `config.json`, the
 * bulk queue state, the embedding model cache and, only when no OS keychain exists, the
 * encrypted secrets file. Nothing in it is call content.
 */
export function dataDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.ASKCALLS_HOME || join(homedir(), '.askcalls');
}

export const paths = (dir: string) => ({
  config: join(dir, 'config.json'),
  secrets: join(dir, 'secrets.enc'),
  bulkState: join(dir, 'ingest-queue.json'),
  models: join(dir, 'models'),
});

export async function ensureDataDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

export async function loadConfig(dir: string): Promise<AgentConfig> {
  let raw: unknown = {};
  try {
    raw = JSON.parse(await readFile(paths(dir).config, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`${paths(dir).config} is not valid JSON`);
    }
  }
  const parsed = AgentConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`${paths(dir).config} has invalid settings: ${fields}`);
  }
  return parsed.data;
}

/** Writes atomically with owner-only permissions. */
export async function writePrivateFile(path: string, data: string | Uint8Array): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, data, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
}

export async function saveConfig(dir: string, patch: Partial<AgentConfig>): Promise<AgentConfig> {
  await ensureDataDir(dir);
  const next = AgentConfigSchema.parse({ ...(await loadConfig(dir)), ...patch });
  await writePrivateFile(paths(dir).config, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

/** `https://Example.com/app` → `https://example.com`. Plain http is allowed only for loopback. */
export function serverOrigin(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`not a URL: ${input}`);
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('the server URL must use https (http is allowed only for localhost)');
  }
  return url.origin;
}
