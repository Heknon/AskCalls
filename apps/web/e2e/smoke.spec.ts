import { expect, test } from '@playwright/test';

test('home page renders the headline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ask your calls anything.');
});

test('health check reports the database and storage up', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toContain('no-store');
  expect(await res.json()).toMatchObject({
    ok: true,
    checks: { database: { ok: true }, storage: { ok: true } },
  });
});

test('the app requires a session and the test provider signs in', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fapp$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');

  await page.getByLabel('Test account email').fill('e2e-smoke@example.test');
  await page.getByRole('button', { name: 'Sign in (test)' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Calls');

  // Signed in, /app renders under the per-request nonce CSP (CLAUDE.md, security rule 4).
  const res = await page.reload();
  const csp = res?.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'wasm-unsafe-eval'/);
  expect(csp).not.toContain('unsafe-inline');
});
