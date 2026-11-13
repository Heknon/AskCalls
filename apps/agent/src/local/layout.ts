import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { writePrivateFile } from '../config';

/**
 * Local mode's part of the data directory (spec 11.2c), next to the agent's own files:
 * - `db/`: PGlite's data directory (ciphertext, wrapped keys, tokens, hashes);
 * - `blobs/`: the fs blob store (encrypted recordings);
 * - `config.json`: instance settings (shared with the agent, see config.ts);
 * - `session-secret`: encrypts the browser's session cookie, owner-only, never backed up;
 * - `local.json`: the running server's pid and port while `askcalls local` runs.
 */
export const localPaths = (dir: string) => ({
  db: join(dir, 'db'),
  blobs: join(dir, 'blobs'),
  config: join(dir, 'config.json'),
  sessionSecret: join(dir, 'session-secret'),
  running: join(dir, 'local.json'),
});

export const DEFAULT_LOCAL_PORT = 4317;

/** The origin of the local instance. `localhost`, not 127.0.0.1: passkeys need a domain. */
export const localOrigin = (port: number) => `http://localhost:${port}`;

/** True for `http://localhost:<port>` and the loopback addresses. */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

const RunningSchema = z.object({
  /** `askcalls local` itself. */
  pid: z.number().int().positive(),
  /** The web server it started, which holds the database open. */
  serverPid: z.number().int().positive(),
  port: z.number().int().min(1).max(65535),
  startedAt: z.string(),
});
export type Running = z.output<typeof RunningSchema>;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The running `askcalls local`, or null (a record left by a crashed run is ignored). */
export async function readRunning(dir: string): Promise<Running | null> {
  try {
    const r = RunningSchema.parse(JSON.parse(await readFile(localPaths(dir).running, 'utf8')));
    return alive(r.pid) || alive(r.serverPid) ? r : null;
  } catch {
    return null;
  }
}

export const writeRunning = (dir: string, r: Running) =>
  writePrivateFile(localPaths(dir).running, `${JSON.stringify(r)}\n`);

export const clearRunning = (dir: string) => rm(localPaths(dir).running, { force: true });

export class LocalRunningError extends Error {
  constructor(port: number) {
    super(
      `askcalls local is running (${localOrigin(port)}). Stop it first (Ctrl-C in its terminal).`,
    );
    this.name = 'LocalRunningError';
  }
}

export async function assertNotRunning(dir: string): Promise<void> {
  const r = await readRunning(dir);
  if (r) throw new LocalRunningError(r.port);
}

/** True when the directory holds local-mode data (a database or recordings). */
export async function hasLocalData(dir: string): Promise<boolean> {
  const p = localPaths(dir);
  for (const d of [p.db, p.blobs]) {
    const entries = await readdir(d).catch(() => []);
    if (entries.some((e) => !e.startsWith('.'))) return true;
  }
  return false;
}
