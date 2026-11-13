import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, card, choose, readSetupToken } from './admin-helpers';
import { addAuthenticator, saveAndConfirmRecoveryCode } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 240_000 });

const LLM_KEY = 'sk-ant-e2e-never-shown';

test('fresh instance: wizard with the setup token, admin, env locks, mock LLM, offline mode', async ({
  page,
  context,
}) => {
  await addAuthenticator(context, page, true);

  // Every page leads to the wizard, which first wants the token from the server log.
  await page.goto('/login');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { name: 'Enter the setup token' })).toBeVisible();
  await page.getByLabel('Setup token').fill('AAAAA-BBBBB-CCCCC-DDDDD');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText("That token doesn't match.")).toBeVisible();
  await page.getByLabel('Setup token').fill(await readSetupToken());
  await page.getByRole('button', { name: 'Continue' }).click();

  // 1. Database: built-in.
  await expect(page.getByRole('heading', { name: 'Choose a database' })).toBeVisible();
  await expect(page.getByText('This instance has no admin yet.')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Built-in' })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();

  // 2. Storage: a local folder.
  await expect(page.getByRole('heading', { name: 'Choose storage' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Local folder' })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();

  // 3. Sign-in: local accounts and Google.
  await expect(page.getByRole('heading', { name: 'Choose how people sign in' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Local accounts' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Google' }).check();
  await page.getByLabel('Client ID').fill('e2e-google-client');
  await page.getByLabel('Client secret').fill('e2e-google-secret');
  await page.getByRole('button', { name: 'Continue' }).click();

  // 4. Cloud transcription and LLM, with keys.
  await expect(page.getByRole('heading', { name: 'Transcription and AI', level: 1 })).toBeVisible();
  const tx = page.getByRole('radiogroup', { name: 'Transcription' });
  await tx.getByRole('radio', { name: 'Cloud provider' }).check();
  await tx.getByLabel('API key').fill('xi-e2e-key');
  const ask = page.getByRole('radiogroup', { name: 'Ask about a call' });
  await ask.getByRole('radio', { name: 'Cloud provider' }).check();
  await ask.getByLabel('API key').fill(LLM_KEY);
  await page.getByRole('button', { name: 'Continue' }).click();

  // 5. Offline mode stays off: three settings would reach the internet.
  await expect(page.getByText('3 settings reach the internet.')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Turn on offline mode' })).toBeDisabled();
  await page.getByRole('button', { name: 'Continue' }).click();

  // 6. The admin, with a passkey.
  await expect(page.getByRole('heading', { name: 'Create the admin account' })).toBeVisible();
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await expect(page.getByText('Passkey created')).toBeVisible();
  await page.getByRole('button', { name: 'Create admin and finish' }).click();

  // Signed in as the admin, straight into onboarding.
  await expect(page).toHaveURL(/\/app\/welcome$/, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Set up encryption' }).click();
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await expect(page.getByText('Passkey created')).toBeVisible();
  await saveAndConfirmRecoveryCode(page);
  await expect(page.getByRole('heading', { name: 'Try it with a sample call' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Go to my calls' }).click();
  await expect(page).toHaveURL(/\/app$/);

  // The setup token is spent: the wizard is gone.
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/login|\/app/);

  await page.goto('/admin/instance');
  await expect(page.getByRole('heading', { name: 'Instance', level: 1 })).toBeVisible();
  expect(await page.content()).not.toContain(LLM_KEY);

  // Env-locked settings are read-only.
  const limits = card(page, 'Limits');
  await expect(limits.getByText('Set by the server environment')).toBeVisible();
  await expect(limits.getByLabel('Calls per user')).toHaveAttribute('readonly', '');
  await expect(limits.getByLabel('Calls per user')).toHaveValue('500');
  await expect(card(page, 'Telemetry').getByText('Set by the server environment')).toBeVisible();
  await expect(card(page, 'Database').getByText('Built-in (PGlite)')).toBeVisible();

  // Switch the LLM to mock and test it before saving.
  const llm = card(page, 'Ask (LLM)');
  await choose(llm, page, 'Provider', 'Mock (testing only)');
  await llm.getByRole('button', { name: 'Test connection' }).click();
  await expect(llm.getByRole('status')).toHaveText(/Connected in \d+ ms\./);
  await llm.getByRole('button', { name: 'Save' }).click();
  await expect(llm.getByRole('button', { name: 'Save' })).toHaveCount(0);
  await expect(llm.locator('[data-component="HealthBadge"]')).toHaveText(/Healthy/);

  // Offline mode lists what still reaches the internet and refuses to turn on.
  const offline = page.locator('[data-component="OfflineBlockerList"]');
  await expect(offline).toContainText('2 settings reach the internet.');
  await expect(offline).toContainText('api.elevenlabs.io');
  await expect(offline).toContainText('accounts.google.com');
  await expect(offline.getByRole('switch')).toBeDisabled();
  const refused = await page.request.patch('/api/admin/instance', {
    data: { patch: { offlineMode: true } },
  });
  expect(refused.status()).toBe(409);

  await offline.getByRole('button', { name: 'Use local Whisper server' }).click();
  await offline.getByRole('button', { name: 'Turn off Google sign-in' }).click();
  await expect(offline).toContainText('Nothing reaches the internet.');
  await offline.getByRole('switch').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Turn on' }).click();
  await expect(offline).toContainText('On. Requests to hosts outside your network are blocked.');
  await expect(offline.getByRole('switch')).toBeChecked();
  await expect(
    card(page, 'Transcription').getByText('Local server (OpenAI-compatible)'),
  ).toBeVisible();

  // Promote: unknown accounts are reported.
  const users = card(page, 'Users');
  await users.getByLabel('Account email').fill('nobody@example.test');
  await users.getByRole('button', { name: 'Make admin' }).click();
  await expect(users.getByText('No account uses that email.')).toBeVisible();
});
