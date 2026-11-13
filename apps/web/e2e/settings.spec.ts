import { createApiClient } from '@askcalls/api-contract';
import { DeviceLinkJoiner, encodeLinkCode } from '@askcalls/client-core/device-link';
import { KeySession } from '@askcalls/client-core/session';
import { MemoryDeviceKeyStore, MemorySecretStore } from '@askcalls/client-core/testing/fakes';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import {
  addAuthenticator,
  lockFromSidebar,
  saveAndConfirmRecoveryCode,
  signIn,
  uniqueEmail,
} from './helpers';

test.describe.configure({ timeout: 240_000 });

/** Signs up and onboards with a PRF passkey; optionally imports the English sample call. */
async function onboard(
  page: Page,
  context: BrowserContext,
  tag: string,
  opts: { sample?: boolean } = {},
): Promise<{ email: string; groups: string[] }> {
  await addAuthenticator(context, page, true);
  const email = uniqueEmail(tag);
  await signIn(page, email);
  await page.getByRole('button', { name: 'Set up encryption' }).click();
  await page.getByRole('button', { name: 'Create passkey' }).click();
  const groups = await saveAndConfirmRecoveryCode(page);
  await expect(page.getByRole('heading', { name: 'Try it with a sample call' })).toBeVisible({
    timeout: 30_000,
  });
  if (opts.sample) {
    await page.getByRole('button', { name: 'Import sample call' }).click();
    await expect(page.getByRole('link', { name: /Daniel Brooks/ })).toBeVisible({
      timeout: 180_000,
    });
    await page.getByRole('button', { name: 'Continue' }).click();
  } else {
    await page.getByRole('button', { name: 'Skip' }).click();
  }
  await page.getByRole('button', { name: 'Go to my calls' }).click();
  await expect(page.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible();
  return { email, groups };
}

async function openSection(page: Page, name: string) {
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name })
    .click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

async function unlockWithPasskey(page: Page) {
  await expect(page.getByRole('heading', { name: 'Unlock your calls' })).toBeVisible();
  await page.getByRole('button', { name: 'Unlock with passkey' }).click();
}

async function unlockWithRecovery(page: Page, groups: string[]) {
  await page.getByRole('button', { name: 'Use recovery code' }).click();
  await page.getByLabel('Group 1').fill(groups.join(''));
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
}

const section = (page: Page, title: string) =>
  page.locator('[data-component="SettingsSection"]').filter({
    has: page.getByRole('heading', { name: title, level: 2 }),
  });

test('security: second passkey, new recovery code, passphrase', async ({ page, context }) => {
  const { groups } = await onboard(page, context, 'security');
  await openSection(page, 'Security');

  const passkeys = section(page, 'Passkeys');
  const rows = passkeys.locator('[data-component="UnlockMethodRow"]');
  await expect(rows).toHaveCount(1);
  await passkeys.getByRole('button', { name: 'Add passkey' }).click();
  await expect(rows).toHaveCount(2);
  // Remove the onboarding passkey: only the new one can unlock now.
  await rows
    .first()
    .getByRole('button', { name: /^Remove / })
    .click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(rows).toHaveCount(1);
  await lockFromSidebar(page);
  await unlockWithPasskey(page);
  await expect(page.getByRole('heading', { name: 'Security', level: 1 })).toBeVisible();

  // Regenerate the recovery code: unlock with the current one, save, confirm.
  await page.getByRole('button', { name: 'Regenerate Recovery code' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Use current recovery code' }).click();
  await dialog.getByLabel('Group 1').fill(groups.join(''));
  await dialog.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Save your new recovery code' })).toBeVisible();
  const fresh = await dialog.locator('[data-component="RecoveryCodeGrid"] li b').allInnerTexts();
  expect(fresh).toHaveLength(8);
  expect(fresh).not.toEqual(groups);
  await dialog.getByLabel('I saved my new recovery code somewhere safe').check();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  const body = await dialog.getByText(/^Type group \d and group \d/).textContent();
  const [a, b] = [...(body ?? '').matchAll(/group (\d)/g)].map((m) => Number(m[1]));
  await dialog.getByLabel(`Group ${a}`).fill(fresh[a! - 1]!);
  await dialog.getByLabel(`Group ${b}`).fill(fresh[b! - 1]!);
  await dialog.getByRole('button', { name: 'Replace recovery code' }).click();
  await expect(page.getByText('Recovery code replaced', { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);

  await lockFromSidebar(page);
  await unlockWithRecovery(page, groups);
  await expect(page.getByText('Wrong code')).toBeVisible();
  await page.getByLabel('Group 1').fill(fresh.join(''));
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Security', level: 1 })).toBeVisible();

  // Set a passphrase, then unlock with it.
  const passphrase = 'a green lamp beside the window';
  await page.getByRole('button', { name: 'Set passphrase Passphrase' }).click();
  await page.getByRole('dialog').getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('dialog').getByLabel('Type it again').fill(passphrase);
  await page.getByRole('dialog').getByRole('button', { name: 'Set passphrase' }).click();
  await expect(page.getByText('Passphrase saved', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: 'Change Passphrase' })).toBeVisible();
  await lockFromSidebar(page);
  await page.getByRole('button', { name: 'Use passphrase' }).click();
  await page.getByLabel('Passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Security', level: 1 })).toBeVisible({
    timeout: 30_000,
  });
});

test('device link: the joiner shows the same fingerprint, links, then is revoked', async ({
  page,
  context,
}) => {
  await onboard(page, context, 'link');
  await openSection(page, 'Security');
  const origin = new URL(page.url()).origin;
  const me = (await (await page.request.get('/api/me')).json()) as { user: { id: string } };

  const started = page.waitForResponse(
    (r) => r.url().endsWith('/api/devices/link') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Link a device' }).click();
  const link = (await (await started).json()) as { sessionId: string; secret: string };
  const dialog = page.getByRole('dialog', { name: 'Link a device' });
  await expect(dialog.getByRole('img', { name: 'QR code of the link code' })).toBeVisible();
  await expect(dialog.getByText('Waiting for the new device…')).toBeVisible();

  const api = createApiClient({ baseUrl: origin });
  const deviceKeys = new MemoryDeviceKeyStore();
  const joiner = await DeviceLinkJoiner.join({
    api,
    code: encodeLinkCode({ ...link, userId: me.user.id }),
    deviceLabel: 'askcalls agent on e2e-box',
    deviceKeys,
  });
  await expect(dialog.getByText('Does the new device show this code?')).toBeVisible();
  await expect(dialog.locator('[data-component="FingerprintCode"]')).toHaveText(joiner.fingerprint);
  await expect(dialog.getByText('askcalls agent on e2e-box')).toBeVisible();
  await dialog.getByRole('button', { name: 'They match, link this device' }).click();
  await expect(dialog.getByText('askcalls agent on e2e-box is linked.')).toBeVisible();

  const session = new KeySession({ idleTimeoutMs: 0 });
  const storage = { kind: 'device-secret' as const, secrets: new MemorySecretStore() };
  let state = 'waiting_for_confirmation';
  for (let i = 0; i < 20 && state !== 'completed'; i++) {
    state = (await joiner.poll({ session, deviceKeys, storage })).state;
  }
  expect(state).toBe('completed');
  expect(session.isUnlocked).toBe(true);
  expect(session.userId).toBe(me.user.id);

  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
  const devices = section(page, 'Linked devices');
  const agentRow = devices
    .locator('[data-component="UnlockMethodRow"]')
    .filter({ hasText: 'askcalls agent on e2e-box' });
  await expect(agentRow).toBeVisible();
  await agentRow.getByRole('button', { name: 'Revoke askcalls agent on e2e-box' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click();
  await expect(agentRow).toHaveCount(0);

  await openSection(page, 'Audit log');
  await expect(page.getByRole('cell', { name: 'Link device' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Revoke device' }).first()).toBeVisible();
});

test('device link: a second browser joins from the QR link and protects RK with a passkey', async ({
  page,
  context,
  browser,
}) => {
  const { email } = await onboard(page, context, 'join');
  await openSection(page, 'Security');
  const me = (await (await page.request.get('/api/me')).json()) as { user: { id: string } };
  const started = page.waitForResponse(
    (r) => r.url().endsWith('/api/devices/link') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Link a device' }).click();
  const link = (await (await started).json()) as { sessionId: string; secret: string };
  const dialog = page.getByRole('dialog', { name: 'Link a device' });
  await expect(dialog.getByText(/In another browser, open .*\/app\/link/)).toBeVisible();

  const other = await browser.newContext();
  const joiner = await other.newPage();
  await addAuthenticator(other, joiner, true);
  await signIn(joiner, email);
  await expect(joiner.getByRole('heading', { name: 'Unlock your calls' })).toBeVisible();
  await joiner.getByRole('link', { name: 'Link this browser from another device' }).click();
  await expect(joiner.getByRole('heading', { name: 'Link this browser' })).toBeVisible();

  // What the QR code opens: the code in the fragment, which never reaches the server.
  const code = encodeLinkCode({ ...link, userId: me.user.id });
  await joiner.goto(`/app/link#${code}`);
  await expect(joiner.getByRole('heading', { name: 'Compare the code' })).toBeVisible();
  expect(new URL(joiner.url()).hash).toBe('');
  const digits = await joiner.locator('[data-component="FingerprintCode"]').textContent();
  expect(digits).toMatch(/^\d{6}$/);
  await expect(dialog.locator('[data-component="FingerprintCode"]')).toHaveText(digits!);
  await dialog.getByRole('button', { name: 'They match, link this device' }).click();
  await expect(dialog.getByText(/is linked\.$/)).toBeVisible();

  await expect(joiner.getByRole('heading', { name: 'Protect this browser' })).toBeVisible({
    timeout: 15_000,
  });
  await joiner.getByRole('button', { name: 'Create passkey' }).click();
  await expect(joiner.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible();

  await lockFromSidebar(joiner);
  await joiner.getByRole('button', { name: 'Unlock with passkey' }).click();
  await expect(joiner.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible();
  await other.close();
});

test('API tokens and retention', async ({ page, context }) => {
  await onboard(page, context, 'tokens');
  await openSection(page, 'API and MCP');
  await expect(page.locator('[data-component="CopyableCode"]').first()).toContainText(
    `bunx askcalls login --url ${new URL(page.url()).origin}`,
  );
  await expect(page.getByText(`${new URL(page.url()).origin}/api/mcp`).first()).toBeVisible();

  await page.getByRole('button', { name: 'Create token' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('e2e-agent');
  await dialog.getByRole('button', { name: 'Create token' }).click();
  await expect(dialog.getByText("Copy it now. You won't see it again.")).toBeVisible();
  const token = (
    (await dialog.locator('[data-component="CopyableCode"] pre').textContent()) ?? ''
  ).trim();
  expect(token).toMatch(/^ac_[A-Za-z0-9_-]{43}$/);
  await dialog.getByRole('button', { name: 'Done' }).click();

  const row = page.locator('[data-component="TokenRow"]').filter({ hasText: 'e2e-agent' });
  await expect(row).toContainText('0 of 60 fetches this hour');
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  expect((await page.request.get('/api/keyring', auth)).status()).toBe(200);

  await row.getByRole('button', { name: 'Revoke e2e-agent' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Revoke' }).click();
  await expect(row).toHaveCount(0);
  expect((await page.request.get('/api/keyring', auth)).status()).toBe(401);

  await openSection(page, 'Retention');
  await page.getByText('Delete calls older than a number of days').click();
  await page.getByRole('spinbutton', { name: 'Days' }).fill('90');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Retention saved', { exact: true })).toBeVisible();
  const r = (await (await page.request.get('/api/settings/retention')).json()) as {
    retentionDays: number | null;
  };
  expect(r.retentionDays).toBe(90);
});

test('export downloads the decrypted sample call, then delete account signs out', async ({
  page,
  context,
}) => {
  const { email } = await onboard(page, context, 'data', { sample: true });
  await openSection(page, 'Data');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export everything' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^askcalls-export-\d{4}-\d{2}-\d{2}\.zip$/);
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const zip = unzipSync(new Uint8Array(Buffer.concat(chunks)));
  const calls = Object.keys(zip).filter((n) => /^calls\/.+\.json$/.test(n));
  expect(calls).toHaveLength(1);
  const call = JSON.parse(strFromU8(zip[calls[0]!]!)) as {
    transcript: { segments: Array<{ text: string }> } | Array<{ text: string }>;
  };
  expect(JSON.stringify(call.transcript)).toContain('The oak cabinets with the long island');
  expect(Object.keys(zip)).toContain('manifest.json');

  await page.getByRole('button', { name: 'Delete account' }).click();
  const confirm = page.getByRole('alertdialog');
  const action = confirm.getByRole('button', { name: 'Delete account' });
  await expect(action).toBeDisabled();
  await confirm.getByLabel(`Type ${email} to confirm`).fill(email);
  await action.click();
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get('/api/me')).status()).toBe(401);

  // Signing in again with the same email starts a new, empty account.
  await signIn(page, email);
  await expect(page).toHaveURL(/\/app\/welcome$/);
});

test('own keys go straight from the browser to the provider', async ({ page, context }) => {
  await onboard(page, context, 'ownkey');
  const origin = new URL(page.url()).origin;
  const ours: Array<{ url: string; body: Buffer | null }> = [];
  const direct: string[] = [];
  context.on('request', (req) => {
    const u = new URL(req.url());
    if (u.origin === origin) ours.push({ url: u.pathname, body: req.postDataBuffer() });
  });
  const cors = {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
  await context.route('https://api.elevenlabs.io/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    direct.push(`${req.method()} ${new URL(req.url()).host}`);
    expect(req.headers()['xi-api-key']).toBe('xi-e2e-key-0001');
    expect(req.postDataBuffer()?.includes(Buffer.from('RIFF'))).toBe(true);
    await route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({
        language_code: 'en',
        language_probability: 1,
        text: 'Tone.',
        words: [{ text: 'Tone.', start: 0, end: 1, type: 'word', speaker_id: 'speaker_0' }],
      }),
    });
  });
  await context.route('https://llm.e2e.test/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    direct.push(`${req.method()} ${new URL(req.url()).host}`);
    expect(req.postData()).toContain('Reply with the single word OK.');
    const chunk = (delta: object, finish: string | null) =>
      `data: ${JSON.stringify({
        id: 'c1',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'llama3',
        choices: [{ index: 0, delta, finish_reason: finish }],
      })}\n\n`;
    await route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'text/event-stream' },
      body: `${chunk({ role: 'assistant', content: 'OK' }, null)}${chunk({}, 'stop')}data: [DONE]\n\n`,
    });
  });

  await openSection(page, 'Providers');
  const tx = page.locator('[data-component="ProviderCard"][data-capability="transcription"]');
  await tx.getByRole('radio', { name: 'Your own key' }).click();
  await tx.getByLabel('API key').fill('xi-e2e-key-0001');
  await tx.getByRole('button', { name: 'Save' }).click();
  // The new provider origin reaches the CSP with the next page load.
  await unlockWithPasskey(page);
  await expect(tx.locator('[data-component="MaskedSecret"]')).toBeVisible();
  await expect(tx.getByText('Billed by ElevenLabs')).toBeVisible();
  await tx.getByRole('button', { name: 'Test connection' }).click();
  await expect(tx.getByText(/Connected\. A 3-second sample transcribed in/)).toBeVisible();

  const ask = page.locator('[data-component="ProviderCard"][data-capability="ask"]');
  await ask.getByRole('radio', { name: 'Your own key' }).click();
  await ask.getByLabel('Provider').click();
  await page.getByRole('option', { name: 'OpenAI-compatible' }).click();
  await ask.getByLabel('Model').fill('llama3');
  await ask.getByLabel('Base URL').fill('https://llm.e2e.test/v1');
  await ask.getByRole('button', { name: 'Save' }).click();
  await unlockWithPasskey(page);
  await ask.getByRole('button', { name: 'Test connection' }).click();
  await expect(ask.getByText(/Connected\. llama3 answered in/)).toBeVisible();

  expect(direct).toEqual(['POST api.elevenlabs.io', 'POST llm.e2e.test']);
  const leaked = ours.filter(
    (r) =>
      r.url.startsWith('/api/transcribe') ||
      r.url.startsWith('/api/ask') ||
      r.body?.includes(Buffer.from('RIFF')) ||
      r.body?.includes(Buffer.from('Reply with the single word OK.')) ||
      r.body?.includes(Buffer.from('xi-e2e-key-0001')),
  );
  expect(leaked, 'requests to our server carrying audio, the prompt or the key').toEqual([]);
});
