import { type BrowserContext, expect, type Page } from '@playwright/test';

let n = 0;
/** A fresh account per test: the in-memory database is shared by every worker. */
export const uniqueEmail = (tag: string) =>
  `e2e-${tag}-${Date.now().toString(36)}-${(n++).toString(36)}@example.test`;

export async function signIn(page: Page, email: string, path = '/app') {
  await page.goto(path);
  await page.getByLabel('Test account email').fill(email);
  await page.getByRole('button', { name: 'Sign in (test)' }).click();
}

/** A CDP virtual authenticator (platform, user-verifying), with or without the PRF extension. */
export async function addAuthenticator(context: BrowserContext, page: Page, prf: boolean) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: prf,
      automaticPresenceSimulation: true,
    },
  });
  return cdp;
}

/** Reads the recovery code off the grid, then confirms the two groups the page asks for. */
export async function saveAndConfirmRecoveryCode(page: Page): Promise<string[]> {
  // Argon2id for a passphrase takes a few seconds.
  await expect(page.getByRole('heading', { name: 'Save your recovery code' })).toBeVisible({
    timeout: 30_000,
  });
  const groups = await page.locator('[data-component="RecoveryCodeGrid"] li b').allInnerTexts();
  expect(groups).toHaveLength(8);
  await page.getByLabel('I saved my recovery code somewhere safe').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  const body = await page
    .getByText(/^Type group \d and group \d from your saved copy\.$/)
    .textContent();
  const [a, b] = [...(body ?? '').matchAll(/group (\d)/g)].map((m) => Number(m[1]));
  await page.getByLabel(`Group ${a}`).fill(groups[a! - 1]!);
  await page.getByLabel(`Group ${b}`).fill(groups[b! - 1]!);
  await page.getByRole('button', { name: 'Confirm and finish setup' }).click();
  return groups;
}

export async function lockFromSidebar(page: Page) {
  await page.getByRole('navigation', { name: 'Main' }).first().waitFor();
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unlock your calls' })).toBeVisible();
}

/** The sign-in page's heading. Local mode (E2E_TARGET=local) signs in from `askcalls local`. */
export function loginHeading(locale: 'en' | 'he'): string {
  const local = process.env.E2E_TARGET === 'local';
  if (locale === 'he') return local ? 'פותחים את AskCalls מהטרמינל' : 'כניסה ל-AskCalls';
  return local ? 'Open AskCalls from your terminal' : 'Sign in to AskCalls';
}
