import { expect, type Page, test } from '@playwright/test';
import {
  addAuthenticator,
  lockFromSidebar,
  saveAndConfirmRecoveryCode,
  signIn,
  uniqueEmail,
} from './helpers';

// Indexing with the embedder on first load takes a while.
test.describe.configure({ timeout: 300_000 });

const srt = (cues: [string, string, string][]) =>
  cues.map(([from, to, line], i) => `${i + 1}\n${from} --> ${to}\n${line}\n`).join('\n');

const daysAgo = (n: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
};

const SEEDED = [
  {
    contactName: 'דנה לוי',
    phone: '+972525550134',
    direction: 'in',
    startedAt: daysAgo(0, 9),
    transcriptText: srt([
      ['00:00:00,000', '00:00:04,000', 'You: סטודיו נועה מטבחים, שלום'],
      ['00:00:04,000', '00:00:12,000', 'דנה: היי, רציתי לדעת מה המחיר למטבח באורך ארבעה מטר'],
      ['00:00:12,000', '00:00:20,000', 'You: אשלח לך הצעה מסודרת עד יום ראשון'],
    ]),
  },
  {
    contactName: 'Yossi Mizrahi',
    phone: '+972545550178',
    direction: 'out',
    startedAt: daysAgo(1, 18),
    transcriptText: srt([
      ['00:00:00,000', '00:00:05,000', 'You: Hi Yossi, about the oak cabinets'],
      [
        '00:00:05,000',
        '00:00:14,000',
        'Yossi: Can you send the quote for the oak finish before Sunday?',
      ],
      ['00:00:14,000', '00:00:20,000', 'You: Sure, I will email it tonight'],
    ]),
  },
];

/** Signs up, onboards with a PRF passkey and imports the English sample in the try step. */
async function onboard(page: Page) {
  await signIn(page, uniqueEmail('calls'));
  await page.getByRole('button', { name: 'Set up encryption' }).click();
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await saveAndConfirmRecoveryCode(page);
  await expect(page.getByRole('heading', { name: 'Try it with a sample call' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Import sample call' }).click();
  await expect(page.getByRole('link', { name: /Daniel Brooks/ })).toBeVisible({ timeout: 180_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Go to my calls' }).click();
  await expect(page.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible();
}

/** Seeds calls through the inbox; the device imports them on the next unlock. */
async function seed(page: Page) {
  for (const call of SEEDED) {
    const res = await page.request.post('/api/inbox', { data: call });
    expect(res.ok()).toBe(true);
  }
  await lockFromSidebar(page);
  await page.getByRole('button', { name: 'Unlock with passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible();
  await expect(rows(page)).toHaveCount(3, { timeout: 60_000 });
}

const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
const rows = (page: Page) => page.locator('[data-component="CallRow"]:not([data-state="locked"])');
const search = (page: Page) => page.getByRole('combobox', { name: 'Search calls' });

/** Past the 250 ms debounce and the request it starts. */
async function settled(page: Page) {
  await page.waitForTimeout(400);
  await expect(page.locator('ul[aria-busy="true"]')).toHaveCount(0);
}

async function clearSearch(page: Page) {
  await search(page).fill('');
  await settled(page);
  await expect(rows(page)).toHaveCount(3);
}

test('search, open, act on and ask about calls; lock wipes the list', async ({ page, context }) => {
  // zod probes `new Function` once and catches the refusal: that `eval` report is expected.
  const violations: string[] = [];
  await context.exposeFunction('reportCsp', (v: string) => violations.push(v));
  await context.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) => {
      if (e.blockedURI !== 'eval') {
        (window as unknown as { reportCsp: (v: string) => void }).reportCsp(
          `${e.violatedDirective} ${e.blockedURI} ${location.pathname}`,
        );
      }
    }),
  );
  await addAuthenticator(context, page, true);
  await onboard(page);
  await seed(page);

  // Keyword with a typo, and the variants it also matched.
  // The Hebrew call says it too: new accounts translate Hebrew calls into English.
  await search(page).fill('pirce');
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: 'Daniel Brooks' })).toHaveCount(1);
  await expect(page.locator('[data-component="ResultLine"]')).toContainText('price');
  await expect(rows(page).first().locator('mark').first()).toHaveText(/price/i);

  // A Hebrew prefix form finds the plain word.
  await search(page).fill('במחיר');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('דנה לוי');

  // By contact, from the suggestions.
  await search(page).fill('Yoss');
  await page.getByRole('option', { name: /Yossi Mizrahi.*Contact/ }).click();
  await expect(search(page)).toHaveValue('');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Yossi Mizrahi');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await settled(page);
  await expect(rows(page)).toHaveCount(3);

  // Meaning: the semantic search ranks by the query embedding.
  await search(page).fill('oak finish quote');
  await page.locator('[data-component="FilterBlank"][data-facet="match"]').click();
  await page.getByRole('button', { name: 'Meaning' }).click();
  await expect(page).toHaveURL(/match=meaning/);
  await expect(rows(page).first()).toContainText('Yossi Mizrahi', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await clearSearch(page);

  // Keyboard: j / k move the cursor, s stars, Enter opens.
  await blur(page);
  await page.keyboard.press('j');
  await expect(rows(page).nth(0)).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('j');
  await expect(rows(page).nth(1)).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('k');
  await expect(rows(page).nth(0)).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('s');
  await expect(rows(page).nth(0).getByRole('button', { name: 'Unstar' })).toBeVisible();

  // Starred, from the "calls" blank.
  await page.locator('[data-component="FilterBlank"][data-facet="starred"]').click();
  await page.getByRole('button', { name: 'Starred calls' }).click();
  await expect(page).toHaveURL(/starred=1/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('דנה לוי');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await settled(page);
  await expect(rows(page)).toHaveCount(3);

  await blur(page);
  await page.keyboard.press('j');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/app\/calls\//);
  await expect(page.locator('[data-component="CallHeader"]')).toContainText('דנה לוי');
  await expect(page.locator('[data-component="TranscriptSegment"]')).toHaveCount(3);

  // Star and tag from the call view.
  const header = page.locator('[data-component="CallHeader"]');
  await expect(header.getByRole('button', { name: 'Unstar' })).toBeVisible();
  await header.getByRole('button', { name: 'Unstar' }).click();
  await expect(header.getByRole('button', { name: 'Star', exact: true })).toBeVisible();
  await header.getByRole('button', { name: 'Star', exact: true }).click();
  await expect(header.getByRole('button', { name: 'Unstar' })).toBeVisible();
  await header.getByRole('button', { name: /^Tag/ }).click();
  await page.getByLabel('Find or create a tag').fill('Hot lead');
  await page.getByRole('button', { name: 'Create tag “Hot lead”' }).click();
  await expect(header.locator('[data-component="TagChip"]', { hasText: 'Hot lead' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  // WhatsApp and call back point at the number.
  await expect(page.getByRole('link', { name: 'Open in WhatsApp' })).toHaveAttribute(
    'href',
    'https://wa.me/972525550134',
  );
  await expect(page.getByRole('link', { name: 'Open in WhatsApp' })).toHaveAttribute(
    'target',
    '_blank',
  );
  await expect(page.getByRole('link', { name: 'Call back' })).toHaveAttribute(
    'href',
    'tel:+972525550134',
  );

  // Download TXT, generated on the device.
  await page.getByRole('button', { name: 'Download' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Transcript (TXT)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^call-\d{4}-\d{2}-\d{2}-.+\.txt$/);

  // Ask with the mock LLM: the consent sheet comes once per unlocked session.
  await page.getByRole('button', { name: 'Summarize this call' }).click();
  const consent = page.getByRole('dialog', { name: 'Send this call to Mock?' });
  await expect(consent).toBeVisible();
  await consent.getByRole('button', { name: 'Send and ask' }).click();
  const answers = page.locator('[data-component="AskMessage"][data-role="answer"]');
  await expect(answers.first()).toContainText('This is a mock answer', { timeout: 30_000 });
  await page.getByLabel('Ask about this call').fill('What did I promise?');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(answers).toHaveCount(2);
  await expect(page.getByRole('dialog', { name: /Send this call to/ })).toHaveCount(0);
  await expect(answers.nth(1)).toContainText('mock answer');

  // Notes save on their own, encrypted.
  await page.getByRole('tab', { name: 'Notes' }).click();
  await page.getByRole('textbox', { name: 'Notes' }).fill('Send the quote by Sunday');
  await expect(page.locator('[data-component="SaveStatus"]')).toHaveText(/Saved/, {
    timeout: 10_000,
  });

  // Back in the list: the tag filters.
  await blur(page);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/app$/);
  await search(page).fill('Hot');
  await page.getByRole('option', { name: /Hot lead.*Tag/ }).click();
  await expect(page).toHaveURL(/tag=/);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Hot lead');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await settled(page);
  await expect(rows(page)).toHaveCount(3);

  // Delete from the call view; the request goes out when the Undo toast closes.
  await rows(page).filter({ hasText: 'Yossi Mizrahi' }).getByRole('link').click();
  await expect(page).toHaveURL(/\/app\/calls\//);
  await page
    .locator('[data-component="CallActions"]')
    .getByRole('button', { name: 'More actions' })
    .click();
  await page.getByRole('menuitem', { name: 'Delete call' }).click();
  const deleted = page.waitForResponse(
    (r) => r.request().method() === 'DELETE' && /\/api\/calls\//.test(r.url()),
    { timeout: 15_000 },
  );
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete call' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('Call deleted', { exact: true })).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  expect((await deleted).ok()).toBe(true);

  // Locking wipes the decrypted list.
  await lockFromSidebar(page);
  await expect(page.locator('[data-component="CallRow"]')).toHaveCount(0);
  await expect(page.getByText('דנה לוי')).toHaveCount(0);

  expect(violations, 'CSP violations').toEqual([]);
});
