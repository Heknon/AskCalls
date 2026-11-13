import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';

/** The admin specs' server: fresh, no config file (see playwright.config.ts). */
export const ADMIN_PORT = Number(process.env.E2E_ADMIN_PORT ?? 3418);
export const ADMIN_URL = `http://localhost:${ADMIN_PORT}`;
export const ADMIN_DATA_DIR = join(tmpdir(), `askcalls-e2e-admin-${ADMIN_PORT}`);

/** The one-time token the server printed at boot, from the file it also writes. */
export async function readSetupToken(): Promise<string> {
  return (await readFile(join(ADMIN_DATA_DIR, 'setup-token'), 'utf8')).trim();
}

export const ADMIN_EMAIL = 'owner@example.test';

/** One `ProviderCard` on /admin/instance, by its title. */
export function card(page: Page, title: string): Locator {
  return page
    .locator('[data-component="ProviderCard"]')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

export async function choose(scope: Locator, page: Page, label: string, option: string) {
  await scope.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
