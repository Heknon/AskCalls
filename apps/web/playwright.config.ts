import { existsSync, readdirSync } from 'node:fs';
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
  use: { baseURL },
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
  ],
  webServer: [
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
        TRANSCRIPTION_PROVIDER: 'mock',
        LLM_PROVIDER: 'mock',
        TELEMETRY: 'none',
        ...(REAL_MODEL ? {} : { ASKCALLS_TEST_EMBEDDER: 'true' }),
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
