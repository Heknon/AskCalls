import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { TarWriter } from './tar';
import { installWebBundle, SERVER_ENTRY } from './web-bundle';

async function archive(dir: string): Promise<Uint8Array> {
  const tar = join(dir, 'bundle.tar');
  const w = await TarWriter.create(tar);
  await w.addBytes('apps/web/local-server.mjs', new TextEncoder().encode('export {};\n'));
  await w.addDirectory('apps/web/public/models');
  await w.finish();
  return gzipSync(await readFile(tar));
}

const serve = (bytes: Uint8Array) =>
  (async () => new Response(new Blob([Uint8Array.from(bytes)]))) as unknown as typeof fetch;

describe('web bundle download (single binary)', () => {
  it('installs only bytes with the pinned SHA-256', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'askcalls-web-bundle-'));
    const gz = await archive(dir);
    const sha256 = createHash('sha256').update(gz).digest('hex');
    const target = join(dir, 'web');
    const log = () => {};

    const tampered = Uint8Array.from(gz);
    tampered[tampered.length - 10]! ^= 1;
    await expect(
      installWebBundle({ target, url: 'https://x/b.tar.gz', sha256, log, fetch: serve(tampered) }),
    ).rejects.toThrow(/SHA-256 mismatch/);
    await expect(access(target)).rejects.toThrow();

    await installWebBundle({ target, url: 'https://x/b.tar.gz', sha256, log, fetch: serve(gz) });
    expect(await readFile(join(target, SERVER_ENTRY), 'utf8')).toBe('export {};\n');
    await access(join(target, 'apps', 'web', 'public', 'models'));
    expect((await readFile(join(target, '.verified'), 'utf8')).trim()).toBe(sha256);
  });
});
