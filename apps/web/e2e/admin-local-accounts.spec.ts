import { expect, test } from '@playwright/test';
import { addAuthenticator, uniqueEmail } from './helpers';

// Runs after admin-setup.spec.ts: local accounts on, offline mode on.
test.describe.configure({ timeout: 120_000 });

test('local account with a password: sign up, sign out, wrong password, sign in', async ({
  page,
  context,
}) => {
  const email = uniqueEmail('password');
  const password = 'correct horse battery staple';
  await page.goto('/login');
  await expect(page.getByLabel('Test account email')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('too short');
  await page.getByRole('button', { name: 'Create account with a password' }).click();
  await expect(page.getByText('At least 12 characters.').last()).toBeVisible();
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account with a password' }).click();
  await expect(page).toHaveURL(/\/app\/welcome$/);

  await context.clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('not the password at all');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Wrong email or password.')).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/welcome$/);
});

test('local account with a passkey: sign up, sign out, sign in with the passkey', async ({
  page,
  context,
}) => {
  await addAuthenticator(context, page, false);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email').fill(uniqueEmail('passkey-account'));
  await page.getByRole('button', { name: 'Create account with a passkey' }).click();
  await expect(page).toHaveURL(/\/app\/welcome$/);

  await context.clearCookies();
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page).toHaveURL(/\/app\/welcome$/);
});
