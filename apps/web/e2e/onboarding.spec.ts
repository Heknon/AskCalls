import { expect, test } from '@playwright/test';
import {
  addAuthenticator,
  lockFromSidebar,
  saveAndConfirmRecoveryCode,
  signIn,
  uniqueEmail,
} from './helpers';

// Indexing with the real embedding model in WebAssembly takes a while on the first load.
test.describe.configure({ timeout: 240_000 });

test('sign up, onboard with a PRF passkey, try the sample, lock and unlock both ways', async ({
  page,
  context,
}) => {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const foreign: string[] = [];
  context.on('request', (req) => {
    const u = new URL(req.url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return;
    if (u.origin !== origin) foreign.push(u.origin);
  });
  await addAuthenticator(context, page, true);

  await signIn(page, uniqueEmail('passkey'));
  await expect(page).toHaveURL(/\/app\/welcome$/);
  await expect(page.getByRole('heading', { name: 'Welcome to AskCalls' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Set up encryption' }).click();
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await expect(page.getByText('Passkey created')).toBeVisible();

  const groups = await saveAndConfirmRecoveryCode(page);

  await expect(page.getByRole('heading', { name: 'Try it with a sample call' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Import sample call' }).click();
  await expect(page.getByRole('combobox')).toHaveValue('pirce', { timeout: 180_000 });
  const row = page.getByRole('link', { name: /Daniel Brooks/ });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-component="ResultLine"]')).toContainText('1 call');
  await expect(page.locator('[data-component="ResultLine"]')).toContainText('price');
  await expect(page.locator('[data-component="CallRow"] mark').first()).toHaveText(/price/i);

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Connect your AI' })).toBeVisible();
  await expect(page.locator('[data-component="CopyableCode"]').first()).toContainText(
    `bunx askcalls login --url ${origin}`,
  );
  await page.getByRole('button', { name: 'Go to my calls' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible();

  await lockFromSidebar(page);
  await page.getByRole('button', { name: 'Use recovery code' }).click();
  await page.getByLabel('Group 1').fill(groups.join(''));
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible();

  await lockFromSidebar(page);
  await page.getByRole('button', { name: 'Unlock with passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible();

  // A deep link while locked opens after unlock, and Shift+L locks.
  await page.goto('/app/settings/privacy');
  await expect(page.getByRole('heading', { name: 'Unlock your calls' })).toBeVisible();
  await page.getByRole('button', { name: 'Unlock with passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  await page.keyboard.press('Shift+L');
  await expect(page.getByRole('heading', { name: 'Unlock your calls' })).toBeVisible();

  expect(foreign, 'requests to other origins').toEqual([]);
});

test('without PRF the passkey step offers a passphrase, which then unlocks', async ({
  page,
  context,
}) => {
  await addAuthenticator(context, page, false);
  await signIn(page, uniqueEmail('passphrase'));
  await page.getByRole('button', { name: 'Set up encryption' }).click();
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await expect(page.getByText("This browser can't unlock AskCalls")).toBeVisible();
  await page.getByRole('button', { name: 'Use a passphrase', exact: true }).click();

  await page.getByLabel('Passphrase', { exact: true }).fill('too short');
  await page.getByLabel('Type it again').fill('too short');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Use at least 12 characters.')).toBeVisible();

  const passphrase = 'blue kettle on the third shelf';
  await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await expect(page.getByText('Strong')).toBeVisible();
  await page.getByLabel('Type it again').fill(passphrase);
  await page.getByRole('button', { name: 'Continue' }).click();
  await saveAndConfirmRecoveryCode(page);
  await expect(page.getByRole('heading', { name: 'Try it with a sample call' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Go to my calls' }).click();

  await lockFromSidebar(page);
  await expect(page.getByRole('button', { name: 'Unlock with passkey' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use passphrase' }).click();
  await page.getByLabel('Passphrase').fill('not the passphrase');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByText('Wrong passphrase. Try again.')).toBeVisible();
  await page.getByLabel('Passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible();
});
