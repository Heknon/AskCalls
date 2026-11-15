import { expect, type Page, test } from '@playwright/test';
import { go, onboard, uploadSingle } from './fixtures/upload-organise';

test.describe.configure({ timeout: 300_000 });

const txt = (name: string, text: string) => ({ name, mimeType: 'text/plain', content: text });

/** The meaning half of a search: the request that carries the query's vector. */
const isMeaning = (body: string | null) => (body ?? '').includes('"vector"');

async function search(page: Page, text: string) {
  const box = page
    .getByRole('searchbox')
    .or(page.getByPlaceholder(/Search/))
    .first();
  await box.fill(text);
  await box.press('Enter');
}

test('a meaning search that fails or never answers still ends with the word matches', async ({
  page,
  context,
}) => {
  await onboard(page, context, 'meaning');
  await uploadSingle(page, txt('car.txt', 'Dana: Someone needs to drive the car tomorrow.'));
  await uploadSingle(page, txt('van.txt', 'Ron: The car is parked outside the office.'));
  await go(page, 'Calls');
  const loading = page.getByRole('status').filter({ hasText: 'Loading more calls' });
  const rows = page.locator('[data-component="CallRow"]');

  await page.route('**/api/search', (route) =>
    isMeaning(route.request().postData()) ? route.abort() : route.fallback(),
  );
  await search(page, 'car');
  await expect(rows).toHaveCount(2);
  await expect(loading).toHaveCount(0);
  await expect(page.getByText('2 calls', { exact: true })).toBeVisible();

  await page.unroute('**/api/search');
  await page.route('**/api/search', (route) => {
    if (!isMeaning(route.request().postData())) return route.fallback();
  });
  await search(page, 'parked car');
  await expect(rows.first()).toBeVisible();
  await expect(loading).toBeVisible();
  await expect(loading).toHaveCount(0, { timeout: 45_000 });
  await expect(rows.first()).toBeVisible();
});
