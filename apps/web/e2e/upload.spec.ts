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
  const groups = page.locator('[data-component="ImportGroup"]');
  await expect(groups).toHaveCount(3);
  await expect(groups.filter({ hasText: 'Dana Levi' })).toContainText('2 calls');
  await expect(groups.filter({ hasText: 'Avi Ben David' })).toContainText('1 call');
  await expect(groups.filter({ hasText: 'No contact' })).toContainText('2 calls');

  await page.getByRole('button', { name: 'Import 5 calls' }).click();
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

test('the empty bulk tab shows the folder layout and an example manifest', async ({
  page,
  context,
}) => {
  await onboard(page, context, 'guide');
  await go(page, 'Upload');
  await page.getByRole('tab', { name: 'Bulk' }).click();
  const guide = page.locator('[data-component="ImportFormatGuide"]');
  await guide.getByRole('button', { name: 'Folder layout and manifest.csv' }).click();
  await expect(guide).toContainText('2026-03-01 Dana.txt');
  await expect(guide.locator('[data-component="CopyableCode"]')).toContainText(
    'file,phone,started_at,direction,contact_name,tags',
  );
  const download = page.waitForEvent('download');
  await guide.getByRole('button', { name: 'Download example' }).click();
  expect((await download).suggestedFilename()).toBe('manifest.csv');
});

test('leave out a contact and a single call before the import starts', async ({
  page,
  context,
}) => {
  await onboard(page, context, 'review');
  await go(page, 'Upload');
  await page.getByRole('tab', { name: 'Bulk' }).click();
  const txt = (name: string, text: string) => ({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await page
    .locator('[data-component="FileDropZone"] input[type="file"]')
    .first()
    .setInputFiles([
      txt('dana-1.txt', 'Dana: The fridge order is confirmed for Sunday.'),
      txt('dana-2.txt', 'Dana: Please move the delivery to Monday.'),
      txt('ron-1.txt', 'Ron: The contract is ready to sign.'),
      {
        name: 'manifest.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(
          [
            'file,phone,contact_name',
            'dana-1.txt,+972501234567,Dana Levi',
            'dana-2.txt,+972501234567,Dana Levi',
            'ron-1.txt,+972527654321,Ron Cohen',
          ].join('\n'),
        ),
      },
    ]);

  const groups = page.locator('[data-component="ImportGroup"]');
  await expect(groups).toHaveCount(2, { timeout: 30_000 });
  const dana = groups.filter({ hasText: 'Dana Levi' });
  await expect(dana).toContainText('2 calls');

  await page.getByRole('checkbox', { name: 'Include Ron Cohen' }).click();
  await expect(count(page, 'transcript only')).toHaveText('2');
  await expect(page.getByRole('button', { name: 'Import 2 calls' })).toBeVisible();

  await dana.getByRole('button', { name: /^Dana Levi/ }).click();
  await page.getByRole('checkbox', { name: 'Include dana-2.txt' }).click();
  await expect(dana).toContainText('1 of 2');
  await expect(dana.getByRole('checkbox', { name: 'Include Dana Levi' })).toHaveAttribute(
    'data-state',
    'indeterminate',
  );
  await expect(page.getByText('1 of 3 selected')).toBeVisible();

  await page.getByRole('radio', { name: 'Folder' }).click();
  const top = groups.filter({ hasText: 'Top folder' });
  await expect(top).toContainText('1 of 3');
  await expect(top.locator('[data-component="QueueRow"][data-selected="true"]')).toHaveCount(1);
  await expect(top.locator('[data-component="QueueRow"][data-selected="true"]')).toContainText(
    'dana-1.txt',
  );

  await page.getByRole('checkbox', { name: 'All calls' }).click();
  await expect(page.getByRole('button', { name: 'Import 3 calls' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'All calls' }).click();
  await expect(page.getByRole('button', { name: 'Import 0 calls' })).toBeDisabled();
  await expect(page.getByText('Select calls to import.')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Include dana-1.txt' }).click();

  await page.getByRole('button', { name: 'Import 1 call' }).click();
  await expect(page.getByText('1 calls imported. 0 failed, 0 duplicates.')).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByRole('tablist', { name: 'Show' }).getByRole('tab', { name: /All/ }),
  ).toContainText('1');
});

test('fix the contact of a group and a single call before the import starts', async ({
  page,
  context,
}) => {
  await onboard(page, context, 'edit');
  await go(page, 'Upload');
  await page.getByRole('tab', { name: 'Bulk' }).click();
  const txt = (name: string, text: string) => ({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await page
    .locator('[data-component="FileDropZone"] input[type="file"]')
    .first()
    .setInputFiles([
      txt('Call אלון שני_240501_101532.txt', 'Alon: The tiles arrive on Tuesday.'),
      txt('Call \u202Bאלון שני\u202C_240502_101532.txt', 'Alon: The grout is the grey one.'),
      txt('misc-1.txt', 'Ron: The contract is ready to sign.'),
    ]);

  const groups = page.locator('[data-component="ImportGroup"]');
  await expect(groups).toHaveCount(2, { timeout: 30_000 });
  const alon = groups.filter({ hasText: 'אלון שני' });
  await expect(alon).toContainText('2 calls');
  await expect(alon).not.toContainText('Call');

  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Edit אלון שני' }).click();
  await expect(dialog.getByRole('heading', { name: 'Edit 2 calls' })).toBeVisible();
  await expect(dialog.getByLabel('Date and time')).toHaveCount(0);
  await dialog.getByLabel('Phone number').fill('abc');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await dialog.getByLabel('Phone number').fill('050-123-4567');
  await dialog.getByRole('radio', { name: 'Outgoing' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(groups.filter({ hasText: 'אלון שני' })).toContainText('2 calls');

  await page.getByRole('button', { name: 'Edit No contact' }).click();
  await dialog.getByLabel('Contact name').fill('Ron Cohen');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(groups.filter({ hasText: 'Ron Cohen' })).toContainText('1 call');

  await page.getByRole('radio', { name: 'Folder' }).click();
  await page.getByRole('button', { name: 'Edit misc-1.txt' }).click();
  await expect(dialog.getByLabel('Contact name')).toHaveValue('Ron Cohen');
  await dialog.getByRole('button', { name: 'Undo edits' }).click();
  await page.getByRole('radio', { name: 'Contact' }).click();
  await expect(groups.filter({ hasText: 'No contact' })).toContainText('1 call');

  await page.getByRole('button', { name: 'Import 3 calls' }).click();
  await expect(page.getByText('3 calls imported. 0 failed, 0 duplicates.')).toBeVisible({
    timeout: 60_000,
  });
  await go(page, 'Calls');
  await expect(
    page.locator('[data-component="CallRow"]').filter({ hasText: 'אלון שני' }),
  ).toHaveCount(2, { timeout: 30_000 });
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
  await page.getByRole('button', { name: 'Import 10 calls' }).click();
  const progressText = page.locator('[data-component="JobProgress"]');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(progressText).toContainText('Pausing…');
  await page.getByRole('button', { name: 'Cancel pause' }).click();
  await expect(progressText).not.toContainText('Pausing…');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Cancel pause' })).toBeVisible();
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
