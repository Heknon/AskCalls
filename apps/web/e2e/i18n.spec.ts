import { expect, test } from '@playwright/test';
import { addAuthenticator, saveAndConfirmRecoveryCode, signIn, uniqueEmail } from './helpers';

test('the language switch sets dir=rtl and persists in the cookie across reloads', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.getByRole('button', { name: 'Language: עברית' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('כניסה ל-AskCalls');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('כניסה ל-AskCalls');
  await page.getByRole('button', { name: 'שפה: English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('Accept-Language picks Hebrew when nothing else is set', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'he-IL' });
  const page = await context.newPage();
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await context.close();
});

test('the account setting wins over the cookie and survives an unlock', async ({
  page,
  context,
}) => {
  await addAuthenticator(context, page, true);
  await signIn(page, uniqueEmail('locale'));
  await page.getByRole('button', { name: 'Set up encryption' }).click();
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await saveAndConfirmRecoveryCode(page);
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Go to my calls' }).click();

  await page.goto('/app/settings/privacy');
  await page.getByRole('button', { name: 'Unlock with passkey' }).click();
  await page.getByRole('button', { name: 'Language: עברית' }).first().click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  // Still unlocked: the switch re-renders in place.
  await expect(page.getByRole('heading', { name: 'פרטיות', level: 1 })).toBeVisible();

  await context.clearCookies({ name: 'locale' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'ביטול נעילה של השיחות' })).toBeVisible();
});
