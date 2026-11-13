import { expect, test } from '@playwright/test';
import { signIn, uniqueEmail } from './helpers';

test('the service worker caches the static shell only, never /api or /app data', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await signIn(page, uniqueEmail('sw'));
  await page.getByRole('button', { name: 'Set up encryption' }).waitFor();
  for (const path of ['/app', '/app/settings', '/app/upload']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  await page.evaluate(() => fetch('/api/me').then((r) => r.text()));

  const cached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) out.push(new URL(req.url).pathname);
    }
    return out;
  });
  expect(cached.length).toBeGreaterThan(0);
  for (const path of cached) expect(path).toMatch(/^\/(_next\/static|icons)\//);
  expect(cached.some((p) => p.startsWith('/api/') || p.startsWith('/app'))).toBe(false);
});
