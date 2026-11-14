import { expect, type Page, test } from '@playwright/test';
import { go, onboard, wav } from './fixtures/upload-organise';
import { lockFromSidebar } from './helpers';

test.describe.configure({ timeout: 300_000 });
test.skip(process.env.E2E_TARGET === 'local', 'routes a fake bucket over https');

const S3 = 'https://s3.e2e.test';

const card = (page: Page) =>
  page.locator('[data-component="ProviderCard"][data-capability="recordings"]');

/** Recordings go to an S3-compatible bucket the test serves: the in-memory driver can't. */
async function ownBucket(page: Page) {
  const origin = new URL(page.url()).origin;
  const cors = {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, PUT, DELETE, HEAD',
    'access-control-expose-headers': 'etag, content-length',
  };
  const bucket = new Map<string, Buffer>();
  await page.context().route(`${S3}/**`, async (route) => {
    const req = route.request();
    const key = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.method() === 'PUT') bucket.set(key, req.postDataBuffer() ?? Buffer.alloc(0));
    const body = req.method() === 'GET' ? bucket.get(key) : undefined;
    if (req.method() === 'GET' && !body && !key.endsWith('/calls/')) {
      return route.fulfill({ status: 404, headers: cors });
    }
    await route.fulfill({ status: 200, headers: cors, ...(body && { body }) });
  });

  await page.getByRole('link', { name: 'Settings' }).first().click();
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: 'Providers' })
    .click();
  await card(page).getByRole('radio', { name: 'Your own bucket' }).click();
  await card(page).getByLabel('Endpoint').fill(S3);
  await card(page).getByLabel('Bucket').fill('calls');
  await card(page).getByLabel('Access key ID').fill('AKIAE2E');
  await card(page).getByLabel('Secret access key').fill('e2e-secret');
  await card(page).getByRole('button', { name: 'Save' }).click();
  // A save that changes the CSP origins reloads the page, which normally stays unlocked.
  const heading = page.getByRole('heading', { name: 'Unlock your calls' });
  if (
    await heading.waitFor({ timeout: 3_000 }).then(
      () => true,
      () => false,
    )
  ) {
    await page.getByRole('button', { name: 'Unlock with passkey' }).click();
  }
  await expect(card(page)).toBeVisible();
}

test('a recording keeps playing after leaving its call, in the mini-player', async ({
  page,
  context,
}) => {
  await onboard(page, context, 'playback');
  await ownBucket(page);
  await go(page, 'Upload');
  await page.getByRole('tab', { name: 'Single' }).click();
  await page
    .locator('[data-component="FileDropZone"] input[type="file"]')
    .first()
    .setInputFiles({ name: 'long.wav', mimeType: 'audio/wav', buffer: wav(440, 30) });
  await page.getByRole('switch', { name: 'Back up recording' }).click();
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByText('Done', { exact: true })).toBeVisible({ timeout: 90_000 });
  await page.getByRole('link', { name: 'Open call' }).click();

  const player = page.locator('[data-component="RecordingPlayer"]');
  await expect(player).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  const audio = page.locator('audio[data-playback]');
  await expect(audio).toHaveAttribute('src', /^blob:/);
  const callUrl = page.url();
  await player.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();
  const mini = page.getByRole('region', { name: 'Now playing' });
  await expect(mini).toHaveCount(0);

  await go(page, 'Calls');
  await expect(mini).toBeVisible();
  await expect(mini).toHaveAttribute('data-state', 'playing');
  const position = () => audio.evaluate((a: HTMLAudioElement) => a.currentTime);
  await expect.poll(position).toBeGreaterThan(0.5);

  await mini.getByRole('button', { name: 'Pause' }).click();
  await expect(mini).toHaveAttribute('data-state', 'paused');
  const at = await position();
  await mini.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(mini).toHaveAttribute('data-state', 'playing');

  await mini.getByRole('link').click();
  await expect(page).toHaveURL(callUrl);
  await expect(mini).toHaveCount(0);
  await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(position).toBeGreaterThan(at);

  await go(page, 'Upload');
  await mini.getByRole('button', { name: 'Stop playback' }).click();
  await expect(mini).toHaveCount(0);
  expect(await audio.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);

  // Locking ends playback with the rest of the decrypted state.
  await page.goBack();
  await expect(page).toHaveURL(callUrl);
  await player.getByRole('button', { name: 'Play', exact: true }).click();
  await go(page, 'Calls');
  await expect(mini).toHaveAttribute('data-state', 'playing');
  await lockFromSidebar(page);
  await expect(mini).toHaveCount(0);
  await expect(audio).toHaveCount(0);
});
