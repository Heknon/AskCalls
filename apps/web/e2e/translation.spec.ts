import { expect, type Page, test } from '@playwright/test';
import { go, onboard, uploadSingle } from './fixtures/upload-organise';

test.describe.configure({ timeout: 240_000 });

const txt = (name: string, content: string) => ({ name, content, mimeType: 'text/plain' });
const rows = (page: Page) => page.locator('[data-component="CallRow"]:not([data-state="locked"])');
const search = (page: Page) => page.getByRole('combobox', { name: 'Search calls' });

async function matchBy(page: Page, by: 'Exact words' | 'Meaning') {
  await page.locator('[data-component="FilterBlank"][data-facet="match"]').click();
  await page.getByRole('button', { name: by }).click();
}

async function settled(page: Page) {
  await page.waitForTimeout(400);
  await expect(page.locator('ul[aria-busy="true"]')).toHaveCount(0);
}

async function providers(page: Page) {
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: 'Providers' })
    .click();
  await expect(page.getByRole('heading', { name: 'Providers', level: 1 })).toBeVisible();
  return page.locator('[data-component="ProviderCard"][data-capability="translation"]');
}

/**
 * Translation by the user's rules, with the mock LLM's dictionary: a new account starts with
 * Hebrew → English, so "price" finds a Hebrew call but "חוזה" doesn't keyword-match an English
 * one; adding English → Hebrew and applying it to existing calls makes it match.
 */
test('translation rules: one-way search, backfill, and the call view in each language', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await onboard(page, context, 'translation');

  await uploadSingle(page, txt('price.txt', '[00:00:01] Dana: שלום, מה המחיר של המקררים?'));
  await uploadSingle(page, txt('contract.txt', '[00:00:01] Ron: Send the contract on Thursday.'));

  await go(page, 'Calls');
  await search(page).fill('price');
  await matchBy(page, 'Exact words');
  await settled(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first().locator('[data-slot="language"]')).toHaveText('EN');
  await expect(rows(page).first().locator('mark').first()).toHaveText('price');

  await search(page).fill('חוזה');
  await settled(page);
  await expect(rows(page)).toHaveCount(0);
  // Meaning search is cross-lingual and still finds it.
  await matchBy(page, 'Meaning');
  await expect(rows(page).first()).toBeVisible({ timeout: 60_000 });
  await search(page).fill('');
  await settled(page);

  const card = await providers(page);
  await expect(card.locator('[data-rule]')).toHaveAttribute('data-rule', 'he:en');
  await expect(card).toContainText('Hebrew calls are also searchable in English.');
  await expect(card).toContainText(
    "A keyword search in Hebrew won't find calls held only in English",
  );
  await card.getByRole('button', { name: 'Add rule' }).click();
  await expect(card.locator('[data-rule="en:he"]')).toBeVisible();
  await expect(card).toContainText('English calls are also searchable in Hebrew.');
  await expect(card).not.toContainText("won't find");

  const job = card.locator('[data-component="ReindexJob"]');
  await expect(job).toContainText("1 call doesn't match your rules yet", { timeout: 30_000 });
  await job.getByRole('button', { name: 'Apply to existing calls' }).click();
  await expect(page.getByText('1 call updated').first()).toBeVisible({ timeout: 60_000 });

  await go(page, 'Calls');
  await search(page).fill('חוזה');
  await matchBy(page, 'Exact words');
  await settled(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first().locator('[data-slot="language"]')).toHaveText('HE');

  // The Hebrew call opens on the language that matched, and remembers the choice.
  await search(page).fill('refrigerators');
  await settled(page);
  await rows(page).first().getByRole('link').first().click();
  const bar = page.locator('[data-component="LanguageBar"]');
  await expect(bar.getByRole('radio', { name: 'English' })).toHaveAttribute('data-state', 'on');
  await expect(page.locator('[data-component="TranscriptSegment"]').first()).toContainText(
    'refrigerators',
  );
  await expect(bar).toContainText('Machine translation by Mock');
  await bar.getByRole('radio', { name: /Original/ }).click();
  await expect(page.locator('[data-component="TranscriptSegment"]').first()).toContainText(
    'המקררים',
  );
  await bar.getByRole('button', { name: 'Side by side' }).click();
  await expect(
    page.locator('ol[data-columns="2"] [data-component="TranscriptSegment"]'),
  ).toHaveCount(2);
});
