import { defineConfig, devices } from '@playwright/test';

/**
 * The `askcalls local` integration test (e2e-local/): it starts the CLI itself, on a random
 * port, so there is no webServer here. Needs the web bundle (`bun run --cwd apps/agent
 * package:web`); `test:local-mode` builds it first.
 */
export default defineConfig({
  testDir: './e2e-local',
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
