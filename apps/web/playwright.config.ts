import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { ADMIN_DATA_DIR, ADMIN_PORT, ADMIN_URL } from './e2e/admin-helpers';

// Off the usual dev ports, and never reused: a server someone else started has other env.
// E2E_PORT and E2E_ADMIN_PORT let parallel checkouts run their suites side by side.
const port = Number(process.env.E2E_PORT ?? 3417);
const baseURL = `http://localhost:${port}`;
const ci = Boolean(process.env.CI);

/**
 * The admin specs run against a second server that starts fresh, with no config file: the
 * setup wizard, then /admin/instance, offline mode and local accounts. A few settings are
 * env-locked to prove they show read-only.
 */

/**
 * Indexing the sample call needs an embedder. With the model files fetched (`prebuild`), the
 * browser runs the real model; without them (ASKCALLS_SKIP_MODEL_DOWNLOAD) the server, running
 * with NODE_ENV=test, hands the browser a deterministic stand-in.
 */
const models = join(import.meta.dirname, 'public', 'models');
const REAL_MODEL =
  existsSync(models) &&
  readdirSync(models, { recursive: true }).some((f) => String(f).endsWith('.onnx'));

/**
 * E2E_TARGET=local (`test:e2e:local`) runs the suite against `askcalls local` instead: the CLI
 * starts the packaged web bundle (scripts/package-local-web.ts) with APP_MODE=local, PGlite and
 * fs storage in a fresh data directory, bound to 127.0.0.1. NODE_ENV=test keeps the test sign-in
 * next to the local one, so each test still gets a fresh account. The admin specs are about the
 * server-mode wizard and are left out. Run under scripts/without-network.ts, neither the server
 * nor the browser can reach anything but loopback; the browser also sends every non-loopback
 * request to a closed proxy port, so a stray request fails even with the network up.
 */
const local = process.env.E2E_TARGET === 'local';
const LOCAL_HOME = join(tmpdir(), `askcalls-e2e-local-${port}`);
const NO_NETWORK_PROXY = { server: 'http://127.0.0.1:9', bypass: 'localhost,127.0.0.1,[::1]' };

const MOCK_PROVIDERS = {
  TRANSCRIPTION_PROVIDER: 'mock',
  LLM_PROVIDER: 'mock',
  TELEMETRY: 'none',
  ...(REAL_MODEL ? {} : { ASKCALLS_TEST_EMBEDDER: 'true' }),
};

const localServer = {
  command: `rm -rf ${LOCAL_HOME} && bun ../agent/src/cli.ts local --port ${port} --no-open`,
  url: `${baseURL}/api/health`,
  reuseExistingServer: false,
  timeout: 120_000,
  env: {
    NODE_ENV: 'test',
    ASKCALLS_HOME: LOCAL_HOME,
    // No keystore passphrase: `askcalls local` skips linking its agent, which would otherwise
    // add a token and a device to whichever test account unlocks first.
    ASKCALLS_KEYSTORE: 'file',
    ...MOCK_PROVIDERS,
  },
};

/**
 * Runs against the production build (`next build` first, see the `test:e2e` script) with the
 * in-memory database and blob store and the mock providers, so no service is needed.
 * NODE_ENV=test turns on the Auth.js test provider; it is never active in production.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, ...(local && { proxy: NO_NETWORK_PROXY }) },
  projects: [
    {
      name: 'chromium',
      testIgnore: /\/admin-[^/]*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'admin-setup',
      testMatch: /\/admin-setup\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: ADMIN_URL },
    },
    {
      name: 'admin',
      testMatch: /\/admin-(?!setup)[^/]*\.spec\.ts$/,
      dependencies: ['admin-setup'],
      use: { ...devices['Desktop Chrome'], baseURL: ADMIN_URL },
    },
  ].filter((p) => !local || p.name === 'chromium'),
  webServer: local
    ? [localServer]
    : [
        {
          command: `next start --port ${port}`,
          url: `${baseURL}/api/health`,
          reuseExistingServer: false,
          timeout: 60_000,
          env: {
            NODE_ENV: 'test',
            APP_URL: baseURL,
            DB_DRIVER: 'memory',
            BLOB_DRIVER: 'memory',
            ...MOCK_PROVIDERS,
          },
        },
        {
          command: `rm -rf ${ADMIN_DATA_DIR} && next start --port ${ADMIN_PORT}`,
          // A fresh instance serves only the wizard until it is set up.
          url: `${ADMIN_URL}/setup`,
          reuseExistingServer: false,
          timeout: 60_000,
          env: {
            NODE_ENV: 'test',
            APP_URL: ADMIN_URL,
            ASKCALLS_DATA_DIR: ADMIN_DATA_DIR,
            FREE_TIER_MAX_CALLS: '500',
            TELEMETRY: 'none',
            ...(REAL_MODEL ? {} : { ASKCALLS_TEST_EMBEDDER: 'true' }),
          },
        },
      ],
});
