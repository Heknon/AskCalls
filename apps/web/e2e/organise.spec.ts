import { expect, test } from '@playwright/test';
import { go, onboard, uploadSingle } from './fixtures/upload-organise';

test.describe.configure({ timeout: 180_000 });

const txt = (name: string, content: string) => ({ name, content, mimeType: 'text/plain' });

test('a keyword rule applied to existing calls tags the calls that say it', async ({
  page,
  context,
}) => {
  await onboard(page, context, 'rules');
  await uploadSingle(page, txt('billing.txt', 'Ron: The invoices for March went out today.'));
  await uploadSingle(page, txt('lunch.txt', 'Ron: Lunch on Sunday works for me.'));

  await go(page, 'Tags and rules');
  await page.getByRole('button', { name: 'New tag' }).first().click();
  await page.getByLabel('Tag name').fill('Billing');
  await page.getByRole('button', { name: 'Add tag' }).click();
  const row = page.locator('[data-component="TagManagerRow"]', { hasText: 'Billing' });
  await expect(row).toContainText('0 calls');

  await page.getByRole('tab', { name: 'Rules' }).click();
  await expect(page.getByText('No rules yet')).toBeVisible();
  await page.getByRole('button', { name: 'New rule' }).first().click();
  await page.getByLabel('Rule name').fill('Invoices');
  await page.getByRole('button', { name: 'Save rule' }).click();
  await expect(page.getByText('Pick a value.').first()).toBeVisible();

  const keywords = page.getByLabel('Keywords');
  await keywords.fill('invoice');
  await keywords.press('Enter');
  await page.getByRole('combobox', { name: 'Tag', exact: true }).click();
  await page.getByRole('option', { name: 'Billing' }).click();
  await expect(page.getByText('Matches 1 call.')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Apply to existing calls' }).click();
  await expect(page.getByText('Rule applied to 1 call.').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-component="RuleListItem"]')).toContainText(
    'invoice → tag Billing',
  );

  await page.getByRole('tab', { name: 'Tags' }).click();
  await expect(row).toContainText('1 call');

  // The rule also runs at import.
  await uploadSingle(page, txt('more.txt', 'Dana: Please resend the invoice.'));
  await go(page, 'Tags and rules');
  await expect(row).toContainText('2 calls');
});

test('imports add contacts; naming one shows its calls under the name', async ({
  page,
  context,
}) => {
  await onboard(page, context, 'contacts');
  await uploadSingle(page, txt('quote.txt', 'Maya: Can you send the quote again?'), {
    phone: '052-555-0134',
  });
  await uploadSingle(page, txt('other.txt', 'Yossi: The delivery is on Monday.'), {
    phone: '054-555-0000',
  });

  await go(page, 'Contacts');
  const rows = page.locator('[data-component="ContactRow"]');
  await expect(rows).toHaveCount(2, { timeout: 30_000 });
  await page.getByLabel('Search contacts').fill('0134');
  await expect(rows).toHaveCount(1);
  await rows.first().getByRole('link').first().click();
  const panel = page.getByRole('dialog');
  await panel.getByLabel('Name').fill('Maya Cohen');
  await panel.getByLabel('Number 1').fill('12');
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByText('Enter a number with country code')).toBeVisible();
  await panel.getByLabel('Number 1').fill('+972 52 555 0134');
  await panel.getByRole('button', { name: 'Save' }).click();
  const calls = panel.locator('[data-component="CallRow"]');
  await expect(calls).toHaveCount(1, { timeout: 30_000 });
  await expect(calls.first()).toContainText('Maya Cohen');
  await expect(calls.first().getByRole('link')).toHaveAttribute('href', /\/app\/calls\//);
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();

  const contact = rows.filter({ hasText: 'Maya Cohen' });
  await expect(contact).toContainText('+972 52-555-0134');
  await page.getByLabel('Search contacts').fill('nobody');
  await expect(page.getByText('No contact matches')).toBeVisible();
});

test('a VCF import adds contacts once', async ({ page, context }) => {
  await onboard(page, context, 'vcf');
  await go(page, 'Contacts');
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:Dana Levi',
    'TEL;TYPE=CELL:052-555-0134',
    'END:VCARD',
    'BEGIN:VCARD',
    'VERSION:3.0',
    'FN:Avi Ben David',
    'TEL:+972 54-555-0161',
    'END:VCARD',
  ].join('\r\n');
  const input = page.locator('input[type="file"][accept*=".vcf"]');
  await input.setInputFiles({
    name: 'contacts.vcf',
    mimeType: 'text/vcard',
    buffer: Buffer.from(vcf),
  });
  await expect(page.getByText('2 contacts imported, 0 already existed.').first()).toBeVisible();
  await input.setInputFiles({
    name: 'contacts.vcf',
    mimeType: 'text/vcard',
    buffer: Buffer.from(vcf),
  });
  await expect(page.getByText('0 contacts imported, 2 already existed.').first()).toBeVisible();
  await expect(page.locator('[data-component="ContactRow"]')).toHaveCount(2);
});
