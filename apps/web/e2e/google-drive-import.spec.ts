import { expect, test } from '@playwright/test';
import { go, onboard, wav } from './fixtures/upload-organise';
import { routeGoogle, seedDrive } from './google-helpers';

test.describe.configure({ timeout: 300_000 });
test.skip(process.env.E2E_TARGET === 'local', 'needs the fake Google server');

const SECRET = 'quarterly invoice for the zebra warehouse';

test('Bulk upload from Google Drive: allow, connect, pick a folder, import on the device', async ({
  page,
  context,
}) => {
  await onboard(page, context, 'gdimport');
  const origin = new URL(page.url()).origin;
  const google: string[] = [];
  await routeGoogle(context, google, origin);

  const folder = `Calls ${Date.now()}`;
  const calls = await seedDrive({ name: folder, folder: true });
  const may = await seedDrive({ name: 'May', folder: true, parents: [calls] });
  await seedDrive({ name: 'x.wav', parents: [may], bytes: wav(440, 2) });
  await seedDrive({ name: 'x.txt', parents: [may], bytes: `Speaker 1: ${SECRET}` });
  await seedDrive({ name: 'notes.txt', parents: [calls], bytes: 'Speaker 1: call me back' });
  await seedDrive({ name: 'photo.jpg', parents: [calls], bytes: 'jpeg' });

  const ours: Array<{ path: string; body: Buffer | null }> = [];
  const scripts: string[] = [];
  context.on('request', (req) => {
    const u = new URL(req.url());
    if (req.resourceType() === 'script') scripts.push(u.origin);
    if (u.origin === origin) ours.push({ path: u.pathname, body: req.postDataBuffer() });
  });

  // The first time, this browser's CSP must let the page call Drive: allow, reload, unlock.
  await go(page, 'Upload');
  await page.getByRole('tab', { name: 'Bulk' }).click();
  await page.getByRole('button', { name: 'Google Drive' }).click();
  const allow = page.getByRole('alertdialog');
  await expect(allow.getByText('Allow Google Drive')).toBeVisible();
  await allow.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByRole('heading', { name: 'Unlock your calls' })).toBeVisible();
  await page.getByRole('button', { name: 'Unlock with passkey' }).click();
  const csp = (await page.request.get('/app/upload')).headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/connect-src [^;]*https:\/\/www\.googleapis\.com/);
  expect(csp).not.toContain('accounts.google.com');

  // Consent in a popup on our routes, then the picker.
  await page.getByRole('tab', { name: 'Bulk' }).click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Google Drive' }).click();
  await (await popup).waitForEvent('close');
  const picker = page.locator('[data-component="DrivePicker"]');
  await expect(picker.getByRole('heading', { name: 'Choose calls in Google Drive' })).toBeVisible();
  await picker.getByRole('button', { name: `Open ${folder}` }).click();
  await expect(picker.getByText('notes.txt')).toBeVisible();
  await expect(picker.getByText('photo.jpg')).toHaveCount(0);
  await picker.getByRole('button', { name: 'My Drive' }).click();
  await picker.getByRole('checkbox', { name: `Include ${folder}` }).check();
  await picker.getByRole('button', { name: 'Import 1 item' }).click();

  const summary = page.locator('[data-component="PreflightSummary"]');
  await expect(summary).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Import 2 calls' }).click();
  await expect(page.getByText('2 calls imported. 0 failed, 0 duplicates.')).toBeVisible({
    timeout: 120_000,
  });

  // Drive → device: the consent went through our callback, the files never did.
  expect(google.some((g) => g.includes('/drive/v3/files'))).toBe(true);
  expect(ours.some((r) => r.path === '/api/storage/callback/google')).toBe(true);
  const leaked = ours.filter((r) => r.body?.includes(Buffer.from(SECRET)));
  expect(leaked, 'requests to our server carrying transcript text').toEqual([]);
  expect([...new Set(scripts)], 'scripts load from this origin only').toEqual([origin]);

  await go(page, 'Calls');
  await expect(page.locator('[data-component="CallRow"]')).toHaveCount(2, { timeout: 30_000 });
});
