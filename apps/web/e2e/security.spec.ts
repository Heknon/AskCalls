import { expect, test } from '@playwright/test';
import { signIn, uniqueEmail } from './helpers';

test('app routes run under a nonce CSP without unsafe-inline or Google', async ({ page }) => {
  await signIn(page, uniqueEmail('csp'));
  await expect(page).toHaveURL(/\/app\/welcome$/);
  const res = await page.reload();
  const csp = res?.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'wasm-unsafe-eval'/);
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('accounts.google.com');
  expect(res?.headers()['cache-control']).toContain('no-store');
});

test('the sign-in page has its own nonce CSP', async ({ page }) => {
  const res = await page.goto('/login');
  const csp = res?.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).not.toContain('unsafe-inline');
});

test('no request leaves the origin on app pages', async ({ page, context }) => {
  const foreign: string[] = [];
  context.on('request', (r) => {
    const u = new URL(r.url());
    if (!['data:', 'blob:'].includes(u.protocol) && u.host !== 'localhost:3417') foreign.push(u.origin);
  });
  await signIn(page, uniqueEmail('origins'));
  await expect(page.getByRole('heading', { name: 'Welcome to AskCalls' })).toBeVisible();
  await page.goto('/app/settings');
  await page.waitForLoadState('networkidle');
  expect(foreign).toEqual([]);
});
