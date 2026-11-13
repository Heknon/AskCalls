import { expect, type Page, test } from '@playwright/test';
import { go, onboard, wav } from './fixtures/upload-organise';
import { driveState, routeGoogle } from './google-helpers';

test.describe.configure({ timeout: 300_000 });
test.skip(process.env.E2E_TARGET === 'local', 'needs the fake Google server');

const S3 = 'https://s3.e2e.test';

const card = (page: Page) =>
  page.locator('[data-component="ProviderCard"][data-capability="recordings"]');

async function providers(page: Page) {
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: 'Providers' })
    .click();
  await expect(page.getByRole('heading', { name: 'Providers', level: 1 })).toBeVisible();
}

async function unlock(page: Page) {
  await expect(page.getByRole('heading', { name: 'Unlock your calls' })).toBeVisible();
  await page.getByRole('button', { name: 'Unlock with passkey' }).click();
  await expect(card(page)).toBeVisible();
}

/** A save that changes the CSP origins reloads the page, which locks it; others don't. */
async function unlockIfReloaded(page: Page) {
  const heading = page.getByRole('heading', { name: 'Unlock your calls' });
  if (
    await heading.waitFor({ timeout: 3_000 }).then(
      () => true,
      () => false,
    )
  )
    await unlock(page);
}

async function playsBack(page: Page) {
  await go(page, 'Calls');
  await page.locator('[data-component="CallRow"]').first().click();
  const player = page.locator('[data-component="RecordingPlayer"]');
  await expect(player).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(player.locator('audio')).toHaveAttribute('src', /^blob:/);
}

async function moveAll(page: Page, body: RegExp) {
  const move = card(page).getByText(body);
  await expect(move).toBeVisible({ timeout: 30_000 });
  await card(page).getByRole('button', { name: 'Move existing recordings' }).click();
  await expect(page.getByText('1 recording moved', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(move).toBeHidden();
}

const recordings = async () =>
  (await driveState()).files.filter((f) => f.name.startsWith('askcalls-'));

test('Google Drive stores recordings: connect, back up, play, move both ways, disconnect', async ({
  page,
  context,
}) => {
  await onboard(page, context, 'gdrive');
  const origin = new URL(page.url()).origin;
  const google: string[] = [];
  await routeGoogle(context, google, origin);

  const bucket = new Map<string, Buffer>();
  const cors = {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, PUT, DELETE, HEAD',
    'access-control-expose-headers': 'etag, content-length',
  };
  await context.route(`${S3}/**`, async (route) => {
    const req = route.request();
    const key = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.method() === 'PUT') bucket.set(key, req.postDataBuffer() ?? Buffer.alloc(0));
    if (req.method() === 'DELETE') bucket.delete(key);
    const body = req.method() === 'GET' ? bucket.get(key) : undefined;
    if (req.method() === 'GET' && !body && !key.endsWith('/calls/')) {
      return route.fulfill({ status: 404, headers: cors });
    }
    await route.fulfill({ status: 200, headers: cors, ...(body && { body }) });
  });

  const ours: Array<{ method: string; path: string; body: Buffer | null }> = [];
  const scripts: string[] = [];
  context.on('request', (req) => {
    const u = new URL(req.url());
    if (req.resourceType() === 'script') scripts.push(u.origin);
    if (u.origin === origin) {
      ours.push({ method: req.method(), path: u.pathname, body: req.postDataBuffer() });
    }
  });

  // Connect: our popup route, Google's consent (the fake approves at once), our callback.
  await providers(page);
  await card(page).getByRole('radio', { name: 'Google Drive' }).click();
  await expect(card(page).getByText(/not through AskCalls/)).toBeVisible();
  const popup = page.waitForEvent('popup');
  await card(page).getByRole('button', { name: 'Connect Google Drive' }).click();
  await (await popup).waitForEvent('close');
  // The Drive origin reaches the CSP with the next page load.
  await unlock(page);
  await expect(
    card(page).getByText(/Folder AskCalls recordings in dana@example\.test/),
  ).toBeVisible({ timeout: 30_000 });
  await expect(card(page).getByText('Google Drive space used')).toBeVisible();
  const csp = (await page.request.get('/app')).headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/connect-src [^;]*https:\/\/www\.googleapis\.com/);
  expect(csp).not.toContain('accounts.google.com');
  await card(page).getByRole('button', { name: 'Test connection' }).click();
  await expect(card(page).getByText('Connected. Uploads to Google Drive work.')).toBeVisible();

  // Back up a call's recording to Drive, then play it: decrypted on the device.
  await go(page, 'Upload');
  await page.getByRole('tab', { name: 'Single' }).click();
  await page
    .locator('[data-component="FileDropZone"] input[type="file"]')
    .first()
    .setInputFiles({ name: 'drive.wav', mimeType: 'audio/wav', buffer: wav(440, 2) });
  await page.getByRole('switch', { name: 'Back up recording' }).click();
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByText('Done', { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect.poll(async () => (await recordings()).length).toBe(1);
  await playsBack(page);

  // Move it to the user's own S3-compatible bucket and back, ciphertext only.
  await providers(page);
  await card(page).getByRole('radio', { name: 'Your own bucket' }).click();
  await card(page).getByLabel('Endpoint').fill(S3);
  await card(page).getByLabel('Bucket').fill('calls');
  await card(page).getByLabel('Access key ID').fill('AKIAE2E');
  await card(page).getByLabel('Secret access key').fill('e2e-secret');
  await card(page).getByRole('button', { name: 'Save' }).click();
  await unlock(page);
  await moveAll(page, /1 recording is in Google Drive\. This device can move it to your bucket\./);
  expect(await recordings()).toEqual([]);
  expect(bucket.size).toBe(1);
  await playsBack(page);

  await providers(page);
  await card(page).getByRole('radio', { name: 'Google Drive' }).click();
  await unlockIfReloaded(page);
  await moveAll(page, /1 recording is in your bucket\. This device can move it to Google Drive\./);
  expect(await recordings()).toHaveLength(1);
  expect(bucket.size).toBe(0);
  await playsBack(page);

  // Disconnect offers to move what Drive holds first.
  await providers(page);
  await card(page).getByRole('button', { name: 'Disconnect' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(
    dialog.getByText(/1 recording in Google Drive moves to the AskCalls bucket first/),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await card(page).getByRole('radio', { name: 'Your own bucket' }).click();
  await unlockIfReloaded(page);
  await moveAll(page, /1 recording is in Google Drive\./);
  await card(page).getByRole('radio', { name: 'Google Drive' }).click();
  await unlockIfReloaded(page);
  await card(page).getByRole('button', { name: 'Disconnect' }).click();
  await expect(
    dialog.getByText('AskCalls loses access to your Drive.', { exact: false }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Disconnect' }).click();
  await unlockIfReloaded(page);
  await expect(card(page).getByRole('radio', { name: 'AskCalls managed' })).toBeChecked();
  expect((await driveState()).revoked).toBe(1);

  // Only the token pass-through carries the refresh token; no recording reaches our server.
  const tokenCalls = ours.filter((r) => r.path === '/api/storage/token/google');
  expect(tokenCalls.length).toBeGreaterThan(0);
  const offending = ours.filter(
    (r) =>
      r.path.endsWith('/recording-upload') ||
      (r.path !== '/api/storage/token/google' && r.body?.includes(Buffer.from('1//rt-'))),
  );
  expect(offending, 'requests to our server carrying a recording or the refresh token').toEqual([]);
  expect(google.some((g) => g.startsWith('GET accounts.google.com/o/oauth2/v2/auth'))).toBe(true);
  expect(google.some((g) => g.startsWith('PUT www.googleapis.com/upload/drive/v3/files'))).toBe(
    true,
  );
  expect([...new Set(scripts)], 'scripts load from this origin only').toEqual([origin]);
});
