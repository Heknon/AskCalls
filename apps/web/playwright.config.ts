import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Off the usual dev ports, and never reused: a server someone else started has other env.
const port = 3417;
const baseURL = `http://localhost:${port}`;
const ci = Boolean(process.env.CI);

/**
 * Indexing the sample call needs an embedder. With the model files fetched (`prebuild`), the
 * browser runs the real model; without them (ASKCALLS_SKIP_MODEL_DOWNLOAD) the server, running
 * with NODE_ENV=test, hands the browser a deterministic stand-in.
 */
const models = join(import.meta.dirname, 'public', 'models');
const REAL_MODEL =
  existsSync(models) &&
  readdirSync(models).some((rev) =>
    existsSync(join(models, rev, 'Xenova/multilingual-e5-small/onnx/model_quantized.onnx')),
  );

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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
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
});
