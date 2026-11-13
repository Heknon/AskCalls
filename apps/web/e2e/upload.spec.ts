import { expect, type Page, test } from '@playwright/test';
import { go, onboard, prepareFolder, stubFolderPicker, wav } from './fixtures/upload-organise';

test.describe.configure({ timeout: 180_000 });

const CALL_A =
  'Agent: Hello Dana, this is Ron from the clinic.\nDana: Hi Ron, did you send the invoice?\nAgent: Yes, this morning.';
const QUOTE = `1
00:00:00,000 --> 00:00:04,000
Maya: Can you send me a quote for the kitchen?

2
00:00:04,500 --> 00:00:08,000
Agent: Sure, by Thursday.
`;
const SAMSUNG = 'Call recording 0525550177_261110_091201.wav';

const MIXED = {
  'call-a.wav': wav(440),
  'call-a.txt': CALL_A,
  'copies/call-a.wav': wav(440),
  'copies/call-a.txt': CALL_A,
  [SAMSUNG]: wav(660),
  'maya-cohen-quote.srt': QUOTE,
  'copies/maya-quote-copy.srt': QUOTE,
  'notes.pdf': 'not a call',
  'manifest.csv': [
    'file,phone,started_at,direction,contact_name,tags',
    'call-a.wav,+972501234567,2026-10-01 10:00,in,Dana Levi,Clinic',
    `${SAMSUNG},+972545550161,,out,Avi Ben David,`,
  ].join('\n'),
};

const summary = (page: Page) => page.locator('[data-component="PreflightSummary"]');
const count = (page: Page, label: string) =>
  summary(page).getByText(label, { exact: true }).locator('xpath=preceding-sibling::b');

test('bulk upload of a mixed folder with a manifest and duplicates', async ({ page, context }) => {
  await stubFolderPicker(context);
  await onboard(page, context, 'bulk');
  await go(page, 'Upload');
  await page.getByRole('tab', { name: 'Bulk' }).click();
  await prepareFolder(page, 'mixed', MIXED);
  await page.getByRole('button', { name: 'Choose a folder' }).click();

  await expect(summary(page)).toBeVisible({ timeout: 30_000 });
  await expect(count(page, 'audio only, will be transcribed')).toHaveText('1');
  await expect(count(page, 'audio with transcript')).toHaveText('2');
  await expect(count(page, 'transcript only')).toHaveText('2');
  await expect(count(page, 'likely duplicates, skipped')).toHaveText('1');
  await expect(summary(page)).toContainText('manifest.csv set names and dates for 3 files.');
  await expect(summary(page).locator('[data-component="DataFlowNote"]').first()).toContainText(
    'Audio passes through AskCalls to Mock transcriber',
  );
  await expect(page.locator('[data-component="QueueRow"]')).toHaveCount(5);

  await page.getByRole('button', { name: 'Start import' }).click();
  await expect(page.getByText('3 calls imported. 0 failed, 2 duplicates.')).toBeVisible({
    timeout: 120_000,
  });
  const tabs = page.getByRole('tablist', { name: 'Show' });
  await expect(tabs.getByRole('tab', { name: /All/ })).toContainText('5');
  await expect(tabs.getByRole('tab', { name: /Duplicates/ })).toContainText('2');
  await expect(tabs.getByRole('tab', { name: /Failed/ })).toContainText('0');
  const rows = page.locator('[data-component="QueueRow"]');
  await expect(rows.filter({ hasText: SAMSUNG })).toContainText('Avi Ben David');
  await expect(rows.filter({ hasText: SAMSUNG })).toContainText('Done');
  await expect(rows.filter({ hasText: 'call-a.wav' }).first()).toContainText('Dana Levi');

  await tabs.getByRole('tab', { name: /Duplicates/ }).click();
  await expect(rows).toHaveCount(2);
  await expect(
    rows.getByRole('link', { name: /Matches the call on|Open the existing call/ }),
  ).toHaveCount(2);

  // The manifest's tag is in the catalog, on one call.
  await go(page, 'Tags and rules');
  await expect(
    page.locator('[data-component="TagManagerRow"]', { hasText: 'Clinic' }),
  ).toContainText('1 call');
});

test('pause, reload, unlock, pick the files again and resume', async ({ page, context }) => {
  await onboard(page, context, 'resume');
  await go(page, 'Upload');
  await page.getByRole('tab', { name: 'Bulk' }).click();
  const files = Array.from({ length: 10 }, (_, i) => ({
    name: `call-${String(i + 1).padStart(2, '0')}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from(`Caller ${i + 1}: order number ${(i + 1) * 1_111} is ready for pickup.`),
  }));

  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route('**/api/calls', async (route) => {
    if (route.request().method() === 'POST') await gate;
    await route.continue();
  });

  await page
    .locator('[data-component="FileDropZone"] input[type="file"]')
    .first()
    .setInputFiles(files);
  await expect(count(page, 'transcript only')).toHaveText('10', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Start import' }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Pausing…' })).toBeVisible();
  release();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 60_000 });
  const progress = page.locator('[data-component="JobProgress"]');
  const done = Number((await progress.textContent())?.match(/(\d+) of 10 files done/)?.[1]);
  expect(done).toBeGreaterThan(0);
  expect(done).toBeLessThan(10);
  await page.unroute('**/api/calls');

  // Files from a file picker don't survive a reload: the queue asks for them again.
  await page.reload();
  await page.getByRole('button', { name: 'Unlock with passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Upload', level: 1 })).toBeVisible();
  const banner = page.locator('[data-component="StatusBanner"]', { hasText: 'Import paused' });
  await expect(banner).toContainText(
    `Import paused: ${done} of 10 done. Pick the folder again to continue.`,
  );
  await expect(page.locator('[data-component="QueueRow"]', { hasText: 'Queued' })).toHaveCount(
    10 - done,
  );
  await page.locator('input[aria-label="Choose the files again"]').setInputFiles(files);
  await expect(banner).not.toContainText('Pick the folder again');
  await banner.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByText('10 calls imported. 0 failed, 0 duplicates.')).toBeVisible({
    timeout: 60_000,
  });
});

test('single upload confirms the details, then reports the duplicate', async ({
  page,
  context,
}) => {
  await onboard(page, context, 'single');
  await go(page, 'Upload');
  await expect(page.getByRole('tab', { name: 'Single', selected: true })).toBeVisible();
  await page
    .locator('[data-component="FileDropZone"] input[type="file"]')
    .first()
    .setInputFiles({ name: SAMSUNG, mimeType: 'audio/wav', buffer: wav(520) });
  await expect(page.getByLabel('Phone number')).toHaveValue('+972 52-555-0177');
  await expect(page.getByLabel('Date and time')).not.toHaveValue('');
  const notes = page.locator('[data-component="DataFlowNote"]');
  await expect(notes.first()).toContainText('Mock transcriber');
  // Translation is named too: new accounts translate Hebrew calls into English.
  await expect(notes.nth(1)).toContainText('translation rules cover are also translated');
  await page.getByLabel('Phone number').fill('12');
  await expect(page.getByText('Enter a number with country code')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled();
  await page.getByLabel('Phone number').fill('052-555-0177');
  await page.getByRole('radio', { name: 'Outgoing' }).click();
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByText('Done', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('link', { name: 'Open call' })).toHaveAttribute(
    'href',
    /\/app\/calls\//,
  );

  await page.getByRole('button', { name: 'Upload another' }).click();
  await page
    .locator('[data-component="FileDropZone"] input[type="file"]')
    .first()
    .setInputFiles({ name: 'again.wav', mimeType: 'audio/wav', buffer: wav(520) });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByText('Already uploaded')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('link', { name: 'Open the existing call' })).toBeVisible();
});
