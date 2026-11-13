import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface PinnedFile {
  path: string;
  bytes: number;
  sha256: string;
}

export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

export async function verified(path: string, f: Omit<PinnedFile, 'path'>): Promise<boolean> {
  const s = await stat(path).catch(() => null);
  return !!s && s.size === f.bytes && (await sha256File(path)) === f.sha256;
}

/** Downloads `url` to `target`, refusing anything but the pinned size and SHA-256. */
export async function download(url: string, target: string, f: Omit<PinnedFile, 'path'>) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`GET ${url}: HTTP ${res.status}`);
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.part`;
  const h = createHash('sha256');
  const writer = Bun.file(tmp).writer();
  let n = 0;
  let lastLog = 0;
  for await (const part of res.body) {
    h.update(part);
    writer.write(part);
    n += part.length;
    if (f.bytes > 10_000_000 && n - lastLog > 20_000_000) {
      lastLog = n;
      console.log(`  ${Math.round((100 * n) / f.bytes)}%`);
    }
  }
  await writer.end();
  const digest = h.digest('hex');
  if (n !== f.bytes || digest !== f.sha256) {
    await rm(tmp, { force: true });
    throw new Error(`${url}: got ${n} bytes sha256 ${digest}, expected ${f.bytes} ${f.sha256}`);
  }
  await rename(tmp, target);
}
