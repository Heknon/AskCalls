import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { connect, createServer } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, test } from '@playwright/test';
import { addAuthenticator, saveAndConfirmRecoveryCode } from '../e2e/helpers';

/**
 * `askcalls local` end to end (spec 11.2c), with the CLI as users run it: a random port, a fresh
 * data directory, NODE_ENV=production and the real local sign-in. Needs the web bundle
 * (`bun run --cwd apps/agent package:web`).
 */
test.describe.configure({ mode: 'serial', timeout: 600_000 });

const CLI = join(import.meta.dirname, '..', '..', 'agent', 'src', 'cli.ts');

let home: string;
let port: number;
let env: NodeJS.ProcessEnv;

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

interface Local {
  child: ChildProcess;
  signInUrl: string;
  output: string[];
}

/** Starts `askcalls local --no-open` and waits for the sign-in link it prints. */
async function startLocal(): Promise<Local> {
  const child = spawn('bun', [CLI, 'local', '--port', String(port), '--no-open'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output: string[] = [];
  const signInUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(output.join(''))), 180_000);
    const read = (d: Buffer) => {
      output.push(d.toString());
      const m = output.join('').match(/(http:\/\/localhost:\d+\/login#key=[A-Za-z0-9_-]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]!);
      }
    };
    child.stdout!.on('data', read);
    child.stderr!.on('data', read);
    child.once('exit', () => reject(new Error(`askcalls local exited:\n${output.join('')}`)));
  });
  return { child, signInUrl, output };
}

async function stopLocal(local: Local): Promise<void> {
  const exited = new Promise((r) => local.child.once('exit', r));
  local.child.kill('SIGTERM');
  await exited;
}

function cli(...args: string[]): string {
  const r = spawnSync('bun', [CLI, ...args], { env, encoding: 'utf8' });
  expect(r.status, `${args.join(' ')}:\n${r.stdout}${r.stderr}`).toBe(0);
  return r.stdout;
}

function status(path: string, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, path, headers: { host } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    })
      .on('error', reject)
      .end();
  });
}

test.beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'askcalls-local-int-'));
  port = await freePort();
  env = {
    ...process.env,
    NODE_ENV: 'production',
    ASKCALLS_HOME: home,
    ASKCALLS_KEYSTORE: 'file',
    ASKCALLS_KEYSTORE_PASSPHRASE: 'local mode integration passphrase',
  };
});

test.afterAll(async () => {
  await rm(home, { recursive: true, force: true });
});

test('askcalls local: loopback only, onboarding, sample, agent, backup, wipe, restore', async ({
  browser,
}) => {
  let local = await startLocal();

  // Bound to 127.0.0.1 only: every other address of this computer refuses the connection.
  const outside = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  if (outside) {
    const refused = await new Promise<string>((resolve) => {
      const s = connect({ host: outside, port });
      s.once('connect', () => {
        s.destroy();
        resolve('connected');
      });
      s.once('error', (e: NodeJS.ErrnoException) => resolve(e.code ?? 'error'));
    });
    expect(refused).toBe('ECONNREFUSED');
  } else {
    test.info().annotations.push({ type: 'note', description: 'no non-loopback address here' });
  }
  expect(await status('/api/health', `localhost:${port}`)).toBe(200);
  expect(await status('/api/health', `attacker.example:${port}`)).toBe(421);

  const context = await browser.newContext();
  const page = await context.newPage();
  await addAuthenticator(context, page, true);
  // The only other origin is the `askcalls local` link listener, on loopback.
  const foreign: string[] = [];
  context.on('request', (r) => {
    const u = new URL(r.url());
    if (['data:', 'blob:'].includes(u.protocol) || u.host === `localhost:${port}`) return;
    if (u.hostname !== '127.0.0.1' || !u.pathname.startsWith('/link/')) foreign.push(u.origin);
  });

  // Without the key the app sends you to the terminal; the printed link signs you in.
  await page.goto(`http://localhost:${port}/app`);
  await expect(
    page.getByRole('heading', { name: 'Open AskCalls from your terminal' }),
  ).toBeVisible();
  await page.goto(local.signInUrl);
  await expect(page).toHaveURL(/\/app\/welcome$/);
  expect(page.url()).not.toContain('key=');

  await page.getByRole('button', { name: 'Set up encryption' }).click();
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await expect(page.getByText('Passkey created')).toBeVisible();
  const groups = await saveAndConfirmRecoveryCode(page);
  await expect(page.getByRole('heading', { name: 'Try it with a sample call' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Import sample call' }).click();
  await expect(page.getByRole('combobox')).toHaveValue('pirce', { timeout: 180_000 });
  await expect(page.getByRole('link', { name: /Daniel Brooks/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-component="ResultLine"]')).toContainText('1 call');

  // After unlock the browser linked this computer's agent: askcalls mcp works, no login or link.
  await expect
    .poll(() => local.output.join(''), { timeout: 60_000 })
    .toContain('askcalls mcp is now connected');
  const mcp = new Client({ name: 'local-int', version: '0' });
  await mcp.connect(
    new StdioClientTransport({
      command: 'bun',
      args: [CLI, 'mcp'],
      env: env as Record<string, string>,
      stderr: 'ignore',
    }),
  );
  const found = (await mcp.callTool({
    name: 'search_calls',
    arguments: { query: 'price' },
  })) as { isError?: boolean; content: Array<{ text: string }> };
  expect(found.isError, found.content[0]?.text).toBeFalsy();
  expect(found.content[0]!.text).toContain('Daniel Brooks');
  await mcp.close();
  expect(foreign, 'requests to other origins').toEqual([]);
  await context.close();

  // Backup needs the server stopped; restore refuses existing data without --force.
  expect(spawnSync('bun', [CLI, 'backup', join(home, 'x.tar')], { env }).status).toBe(1);
  await stopLocal(local);
  const backup = join(tmpdir(), `askcalls-local-int-${port}.tar`);
  expect(cli('backup', backup)).toContain('Backed up');
  const refused = spawnSync('bun', [CLI, 'restore', backup], { env, encoding: 'utf8' });
  expect(refused.status).toBe(1);
  expect(refused.stderr).toContain('--force');

  // Wipe this computer's AskCalls entirely, keys and agent link included, then restore.
  await rm(home, { recursive: true, force: true });
  expect(cli('restore', backup)).toContain('Restored the backup');
  await rm(backup, { force: true });

  local = await startLocal();
  const fresh = await browser.newContext();
  const again = await fresh.newPage();
  await again.goto(local.signInUrl);
  await expect(again.getByRole('heading', { name: 'Unlock your calls' })).toBeVisible({
    timeout: 30_000,
  });
  await again.getByRole('button', { name: 'Use recovery code' }).click();
  await again.getByLabel('Group 1').fill(groups.join(''));
  await again.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(again.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible();
  await again.getByRole('link', { name: /Daniel Brooks/ }).click();
  await expect(again).toHaveURL(/\/app\/calls\//);
  await expect(again.locator('[data-component="TranscriptSegment"]').first()).toContainText(
    "Hi, it's Daniel Brooks.",
  );
  await fresh.close();
  await stopLocal(local);
});
