import { randomBytes } from 'node:crypto';
import { listKeyring } from '@askcalls/api-contract/routes/keyring';
import { fromUtf8 } from '@askcalls/crypto';
import type { Command } from 'commander';
import { KeychainUnavailableError } from '../adapters/secret-store';
import { type AgentDeps, API_TOKEN_SECRET, apiClient, isLinked, openSecrets } from '../agent';
import { dataDir, ensureDataDir, loadConfig } from '../config';
import { type Io, terminalIo } from '../io';
import { type LocalAgentLinkListener, startLocalAgentLink } from '../local/agent-link';
import {
  clearRunning,
  DEFAULT_LOCAL_PORT,
  LocalRunningError,
  localOrigin,
  readRunning,
  writeRunning,
} from '../local/layout';
import { type LocalServer, localServerEnv, sessionSecret, startLocalServer } from '../local/server';
import { resolveWebBundle } from '../local/web-bundle';
import { describeError, fail } from './run';

export interface LocalOptions {
  port: number;
  open: boolean;
}

export function parsePort(raw: string): number {
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1024 || port > 65535) {
    throw new Error('--port must be a number from 1024 to 65535');
  }
  return port;
}

/** True when this computer's agent holds RK and a token the local instance accepts. */
async function agentLinked(origin: string, deps: AgentDeps): Promise<boolean> {
  const dir = deps.dir ?? dataDir(deps.env);
  if ((await loadConfig(dir)).server !== origin) return false;
  const { store } = await openSecrets(origin, deps);
  const token = await store.get(API_TOKEN_SECRET);
  if (!token || !(await isLinked(store))) return false;
  try {
    await apiClient(origin, fromUtf8(token), deps).request(listKeyring, {});
    return true;
  } catch {
    return false;
  }
}

export interface RunningLocal {
  server: LocalServer;
  signInUrl: string;
  link: LocalAgentLinkListener | null;
  stop(): Promise<void>;
}

/**
 * `askcalls local` (spec 11.2c): the whole product on this computer. Starts the web app from the
 * bundle with APP_MODE=local, PGlite in `<data dir>/db` and recordings in `<data dir>/blobs`,
 * bound to 127.0.0.1, and opens the browser on a sign-in link carrying a key made for this start.
 * Until this computer's agent is linked, it also listens for the browser to link it after unlock
 * (local/agent-link.ts), so `askcalls mcp` then works without `login` or `link`.
 */
export async function startLocal(
  opts: LocalOptions,
  deps: AgentDeps & { io: Io },
): Promise<RunningLocal> {
  const { io } = deps;
  const env = deps.env ?? process.env;
  const dir = deps.dir ?? dataDir(env);
  await ensureDataDir(dir);
  const running = await readRunning(dir);
  if (running) throw new LocalRunningError(running.port);

  const webDir = await resolveWebBundle({ dir, env, log: io.err });
  const origin = localOrigin(opts.port);
  const config = await loadConfig(dir);

  let link: LocalAgentLinkListener | null = null;
  try {
    const { store } = await openSecrets(origin, { ...deps, dir, env });
    link = await startLocalAgentLink({
      origin,
      dir,
      secrets: store,
      deviceLabel: config.deviceLabel,
      deps,
    });
  } catch (e) {
    if (!(e instanceof KeychainUnavailableError)) throw e;
    io.err(
      'askcalls: no OS keychain, so askcalls mcp cannot be connected to this AskCalls. Set ASKCALLS_KEYSTORE_PASSPHRASE and start again to connect it.',
    );
  }

  const key = randomBytes(32).toString('base64url');
  let server: LocalServer;
  try {
    server = await startLocalServer({
      webDir,
      port: opts.port,
      log: io.err,
      env: localServerEnv({
        env,
        dir,
        port: opts.port,
        authSecret: await sessionSecret(dir),
        key,
        agentLinkUrl: link?.url ?? null,
      }),
    });
  } catch (e) {
    link?.close();
    throw e;
  }
  await writeRunning(dir, {
    pid: process.pid,
    serverPid: server.child.pid ?? process.pid,
    port: opts.port,
    startedAt: new Date().toISOString(),
  });

  if (link && (await agentLinked(origin, { ...deps, dir, env }).catch(() => false))) {
    link.markLinked();
  } else
    link?.linked.then(
      () => io.out('askcalls mcp is now connected to this AskCalls. Add it to your AI client.'),
      (e: unknown) =>
        io.err(
          `askcalls: connecting askcalls mcp did not complete (${describeError(e)}); start again to retry.`,
        ),
    );

  const signInUrl = `${origin}/login#key=${key}`;
  let stopped: Promise<void> | null = null;
  const stop = () => {
    stopped ??= (async () => {
      link?.close();
      await server.stop();
      await clearRunning(dir);
    })();
    return stopped;
  };
  server.exited.then(() => clearRunning(dir));
  return { server, signInUrl, link, stop };
}

export async function runLocal(opts: LocalOptions, deps: AgentDeps & { io: Io }): Promise<void> {
  const { io } = deps;
  const local = await startLocal(opts, deps);
  io.out(`AskCalls is running on this computer: ${local.server.origin}`);
  io.out(`Data (encrypted): ${deps.dir ?? dataDir(deps.env)}`);
  if (local.server.runtime === 'bun') {
    io.err(
      'askcalls: Node.js 20+ was not found, so the server runs on Bun. Install Node.js for best results.',
    );
  }
  const opened = opts.open && (await io.openBrowser(local.signInUrl));
  io.out(opened ? 'Opened your browser.' : 'Open this link to start (it signs you in):');
  if (!opened) io.out(`  ${local.signInUrl}`);
  io.out('Stop with Ctrl-C.');

  const onSignal = () => {
    local.stop().then(() => process.exit(0));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  const code = await local.server.exited;
  await local.stop();
  if (code !== 0) throw new Error('the local server stopped');
}

export function registerLocal(program: Command) {
  program
    .command('local')
    .description('Run AskCalls entirely on this computer, bound to 127.0.0.1')
    .option('--port <port>', 'port to listen on', String(DEFAULT_LOCAL_PORT))
    .option('--no-open', 'do not open the browser')
    .action(async (opts: { port: string; open: boolean }) => {
      try {
        await runLocal({ port: parsePort(opts.port), open: opts.open }, { io: terminalIo() });
      } catch (e) {
        fail(e);
      }
    });
}
