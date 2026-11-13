import { ApiError } from '@askcalls/api-contract';
import { listKeyring } from '@askcalls/api-contract/routes/keyring';
import type { Command } from 'commander';
import { type AgentDeps, apiClient, isLinked, openSecrets, storeToken } from '../agent';
import { dataDir, ensureDataDir, paths, saveConfig, serverOrigin } from '../config';
import { type Io, terminalIo } from '../io';
import { startLoopbackLogin } from '../login/loopback';
import { fail } from './run';

const TOKEN_PATTERN = /^ac_[A-Za-z0-9_-]{43}$/;

async function tokenFromBrowser(origin: string, io: Io): Promise<string> {
  const login = await startLoopbackLogin({ serverOrigin: origin });
  io.out('Opening your browser to authorize this computer:');
  io.out(`  ${login.authorizeUrl}`);
  if (!(await io.openBrowser(login.authorizeUrl))) {
    io.out('Could not open a browser. Open the link above yourself.');
  }
  if (!io.interactive) return login.token;
  const abort = new AbortController();
  const pasted = io
    .readLine('Waiting for the browser. Or paste a token (ac_…) and press Enter: ', abort.signal)
    .then((line) => (line ? line : login.token));
  try {
    return await Promise.race([login.token, pasted]);
  } finally {
    abort.abort();
    login.close();
  }
}

/**
 * `askcalls login --url <server>`: gets a personal access token with scopes `read write ask keys`
 * through the browser (or pasted), checks it against the server and stores it in the keychain.
 */
export async function runLogin(
  opts: { url: string; paste?: boolean },
  deps: AgentDeps & { io: Io },
): Promise<void> {
  const { io } = deps;
  const origin = serverOrigin(opts.url);
  const dir = deps.dir ?? dataDir(deps.env);
  await ensureDataDir(dir);
  const secrets = await openSecrets(origin, deps);

  const token = opts.paste
    ? ((await io.readLine('Paste a personal access token (ac_…): ')) ?? '')
    : await tokenFromBrowser(origin, io);
  if (!TOKEN_PATTERN.test(token)) throw new Error('that is not an AskCalls token (ac_…)');

  try {
    await apiClient(origin, token, deps).request(listKeyring, {});
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw new Error('the server rejected the token');
    if (e instanceof ApiError && e.status === 403) {
      throw new Error('the token needs the scopes read, write, ask and keys');
    }
    throw e;
  }
  await storeToken(secrets.store, token);
  await saveConfig(dir, { server: origin });

  io.out(`Logged in to ${origin}.`);
  io.out(
    secrets.kind === 'keychain'
      ? 'The token is stored in the OS keychain.'
      : `No OS keychain was found, so the token is stored in the encrypted file ${paths(dir).secrets}.`,
  );
  io.out(
    (await isLinked(secrets.store))
      ? 'This computer is already linked. Run: bunx askcalls mcp'
      : 'Next, link this computer to unlock your calls: bunx askcalls link',
  );
}

export function registerLogin(program: Command) {
  program
    .command('login')
    .description('Open a browser to create a personal access token (scopes: read write ask keys)')
    .requiredOption('--url <server>', 'AskCalls server URL', 'https://askcalls.com')
    .option('--paste', 'paste a token from Settings → API and MCP instead of using the browser')
    .action((opts: { url: string; paste?: boolean }) =>
      runLogin(opts, { io: terminalIo() }).catch(fail),
    );
}
