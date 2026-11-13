import { type BrowserContext, expect, type Page } from '@playwright/test';
import { addAuthenticator, saveAndConfirmRecoveryCode, signIn, uniqueEmail } from '../helpers';

/** A short 16-bit mono WAV; the tone makes each file's audio (and audio token) different. */
export function wav(frequency: number, seconds = 1, rate = 8_000): Buffer {
  const samples = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * frequency * i) / rate) * 12_000);
    buf.writeInt16LE(v, 44 + i * 2);
  }
  return buf;
}

export type FixtureFiles = Record<string, string | Buffer>;

/**
 * The folder picker returns a folder of the origin-private file system, which the test fills
 * first: a real directory handle that survives a reload, as a picked folder does.
 */
export async function stubFolderPicker(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as unknown as {
      showDirectoryPicker: () => Promise<unknown>;
      e2eFolder?: string;
    };
    w.showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(w.e2eFolder ?? 'fixture');
  });
}

/** Writes files into the origin-private file system under `folder` and makes it the next pick. */
export async function prepareFolder(page: Page, folder: string, files: FixtureFiles) {
  const encoded = Object.entries(files).map(([path, data]) => [
    path,
    (typeof data === 'string' ? Buffer.from(data, 'utf8') : data).toString('base64'),
  ]);
  await page.evaluate(
    async ({ folder, encoded }) => {
      const root = await navigator.storage.getDirectory();
      const base = await root.getDirectoryHandle(folder, { create: true });
      for (const [path, b64] of encoded) {
        const parts = path!.split('/');
        let dir = base;
        for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
        const file = await dir.getFileHandle(parts.at(-1)!, { create: true });
        const w = await file.createWritable();
        await w.write(Uint8Array.from(atob(b64!), (c) => c.charCodeAt(0)));
        await w.close();
      }
      (window as unknown as { e2eFolder: string }).e2eFolder = folder;
    },
    { folder, encoded },
  );
}

/** A new account through onboarding with a PRF passkey, skipping the sample; ends on Calls. */
export async function onboard(page: Page, context: BrowserContext, tag: string) {
  await addAuthenticator(context, page, true);
  await signIn(page, uniqueEmail(tag));
  await expect(page).toHaveURL(/\/app\/welcome$/);
  await page.getByRole('button', { name: 'Set up encryption' }).click();
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await saveAndConfirmRecoveryCode(page);
  await expect(page.getByRole('heading', { name: 'Try it with a sample call' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Go to my calls' }).click();
  await expect(page.getByRole('heading', { name: 'Calls', level: 1 })).toBeVisible();
}

/** Moves within the app without a reload, which would lock it. */
export async function go(page: Page, label: 'Calls' | 'Upload' | 'Tags and rules' | 'Contacts') {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: label })
    .filter({ visible: true })
    .first()
    .click();
}

/** Uploads one call on the Single tab and waits for "Done". */
export async function uploadSingle(
  page: Page,
  file: { name: string; content: string | Buffer; mimeType: string },
  meta: { phone?: string } = {},
) {
  if (!/\/app\/upload$/.test(page.url())) await go(page, 'Upload');
  const another = page.getByRole('button', { name: 'Upload another' });
  if (await another.isVisible()) await another.click();
  await page.getByRole('tab', { name: 'Single' }).click();
  await page
    .locator('[data-component="FileDropZone"] input[type="file"]')
    .first()
    .setInputFiles({
      name: file.name,
      mimeType: file.mimeType,
      buffer: typeof file.content === 'string' ? Buffer.from(file.content) : file.content,
    });
  if (meta.phone) await page.getByLabel('Phone number').fill(meta.phone);
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByText('Done', { exact: true })).toBeVisible({ timeout: 60_000 });
}
