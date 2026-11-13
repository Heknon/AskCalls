import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writePrivateFile } from '../config';
import { localOrigin, localPaths } from './layout';
import { SERVER_ENTRY } from './web-bundle';

/**
 * Instance settings a user's shell may carry that must not reach the local server: anything
 * pointing at another database, bucket, sign-in method or model host. Everything else in the
 * environment applies as in server mode (for example OFFLINE_MODE, TRANSCRIPTION_PROVIDER).
 */
const DROPPED_ENV = [
  /^ASKCALLS_HOSTED$/,
  /^HOSTNAME$/,
  /^DATABASE_URL$/,
  /^PGLITE_DATA_DIR$/,
  /^FS_BLOB_DIR$/,
  /^S3_/,
  /^AUTH_(?!TEST_PROVIDER$)/,
  /^EMBEDDING_MODEL_URL$/,
  /^SCHEDULER$/,
  /^ASKCALLS_LOCAL_/,
  /^__NEXT_PRIVATE_/,
];

/** The cookie-encryption secret, created once (owner-only) and kept across starts. */
export async function sessionSecret(dir: string): Promise<string> {
  const path = localPaths(dir).sessionSecret;
  const existing = await readFile(path, 'utf8').catch(() => '');
  if (existing.trim().length >= 32) return existing.trim();
  const secret = randomBytes(32).toString('base64url');
  await writePrivateFile(path, `${secret}\n`);
  return secret;
}

export function localServerEnv(opts: {
  env: NodeJS.ProcessEnv;
  dir: string;
  port: number;
  authSecret: string;
  key: string;
  agentLinkUrl: string | null;
}): NodeJS.ProcessEnv {
  const kept = Object.entries(opts.env).filter(([k]) => !DROPPED_ENV.some((re) => re.test(k)));
  return {
    ...Object.fromEntries(kept),
    // The e2e suite runs local mode with NODE_ENV=test for its test sign-in; nothing else does.
    NODE_ENV: opts.env.NODE_ENV === 'test' ? 'test' : 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    BUN_BE_BUN: '1',
    PORT: String(opts.port),
    APP_MODE: 'local',
    APP_URL: localOrigin(opts.port),
    ASKCALLS_DATA_DIR: opts.dir,
    DB_DRIVER: 'pglite',
    BLOB_DRIVER: 'fs',
    AUTH_SECRET: opts.authSecret,
    ASKCALLS_LOCAL_KEY: opts.key,
    ...(opts.agentLinkUrl && { ASKCALLS_LOCAL_AGENT_LINK_URL: opts.agentLinkUrl }),
    ASKCALLS_PARENT_PID: String(process.pid),
  };
}

/**
 * The runtime for the web server: Node.js 20+ from PATH, which the web app is built and tested
 * for (spec 3.4), else this program's own Bun (or the single binary acting as Bun), whose
 * Node.js compatibility covers most but not all of Next.js.
 */
export function serverRuntime(env: NodeJS.ProcessEnv): { command: string; name: 'node' | 'bun' } {
  const r = spawnSync('node', ['-p', 'process.versions.node'], { env, encoding: 'utf8' });
  const major = Number(r.stdout?.trim().split('.')[0]);
  if (r.status === 0 && major >= 20) return { command: 'node', name: 'node' };
  return { command: process.execPath, name: 'bun' };
}

export interface LocalServer {
  child: ChildProcess;
  origin: string;
  runtime: 'node' | 'bun';
  /** Resolves with the exit code when the server process ends. */
  exited: Promise<number>;
  stop(): Promise<void>;
}

/** Starts apps/web/local-server.mjs from the web bundle and waits until /api/health answers. */
export async function startLocalServer(opts: {
  webDir: string;
  env: NodeJS.ProcessEnv;
  port: number;
  /** The server's own log lines (content-free), once it has started. */
  log: (line: string) => void;
  timeoutMs?: number;
}): Promise<LocalServer> {
  const runtime = serverRuntime(opts.env);
  const child = spawn(runtime.command, [join(opts.webDir, SERVER_ENTRY)], {
    cwd: join(opts.webDir, 'apps', 'web'),
    env: opts.env,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const stderr: string[] = [];
  let started = false;
  child.stderr?.setEncoding('utf8').on('data', (d: string) => {
    if (started) {
      for (const line of d.trimEnd().split('\n')) opts.log(line);
      return;
    }
    stderr.push(d);
    if (stderr.length > 50) stderr.shift();
  });
  const exited = new Promise<number>((resolve) => {
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    child.once('error', () => resolve(1));
  });
  const origin = localOrigin(opts.port);
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const forced = setTimeout(() => child.kill('SIGKILL'), 15_000);
    await exited;
    clearTimeout(forced);
  };

  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  let done = false;
  exited.then(() => {
    done = true;
  });
  while (!done) {
    try {
      const res = await fetch(`${origin}/api/health`);
      if (res.ok) {
        started = true;
        return { child, origin, runtime: runtime.name, exited, stop };
      }
    } catch {}
    if (Date.now() > deadline) {
      await stop();
      throw new Error('the local server did not start in time');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const reason = stderr.join('').trim().split('\n').slice(-5).join('\n');
  throw new Error(
    /EADDRINUSE/.test(reason)
      ? `port ${opts.port} is in use; choose another with --port`
      : `the local server stopped while starting${reason ? `:\n${reason}` : ''}`,
  );
}
