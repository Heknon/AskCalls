import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSafeArchivePath, readTar, TarFormatError, TarWriter } from './tar';

const temp = () => mkdtemp(join(tmpdir(), 'askcalls-tar-'));

async function entries(path: string) {
  const out: Array<{ path: string; text: string }> = [];
  for await (const e of readTar(path)) {
    if (e.type === 'directory') out.push({ path: `${e.path}/`, text: '' });
    else out.push({ path: e.path, text: new TextDecoder().decode(await e.bytes(1 << 20)) });
  }
  return out;
}

describe('tar', () => {
  it('round-trips short, long and non-ASCII paths, and system tar reads it', async () => {
    const dir = await temp();
    const src = join(dir, 'src.bin');
    await writeFile(src, 'file body');
    const long = `blobs/${'segment/'.repeat(20)}object.blob`;
    const archive = join(dir, 'a.tar');
    const w = await TarWriter.create(archive);
    await w.addBytes('manifest.json', new TextEncoder().encode('{"v":1}'));
    const digest = await w.addFile(long, src, 9, Date.now());
    await w.addBytes('db/שלום.txt', new TextEncoder().encode('x'));
    await w.addDirectory('db/pg_tblspc');
    await w.finish();

    expect(digest).toBe(createHash('sha256').update('file body').digest('hex'));
    expect(await entries(archive)).toEqual([
      { path: 'manifest.json', text: '{"v":1}' },
      { path: long, text: 'file body' },
      { path: 'db/שלום.txt', text: 'x' },
      { path: 'db/pg_tblspc/', text: '' },
    ]);
    const listed = execFileSync('tar', ['--quoting-style=literal', '-tf', archive], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    expect(listed).toEqual(['manifest.json', long, 'db/שלום.txt', 'db/pg_tblspc/']);
  });

  it('extracts with a SHA-256 and refuses to overwrite', async () => {
    const dir = await temp();
    const archive = join(dir, 'a.tar');
    const w = await TarWriter.create(archive);
    await w.addBytes('db/file', new TextEncoder().encode('abc'));
    await w.finish();
    for await (const e of readTar(archive)) {
      const target = join(dir, 'out', e.path);
      expect(await e.extractTo(target)).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
      expect(await readFile(target, 'utf8')).toBe('abc');
      await expect(e.extractTo(target)).rejects.toThrow();
    }
  });

  it('rejects unsafe paths, links and corrupted headers', async () => {
    for (const p of ['../x', '/etc/passwd', 'a//b', 'a/./b', 'a\\b', '']) {
      expect(isSafeArchivePath(p), p).toBe(false);
    }
    const dir = await temp();
    const evil = join(dir, 'evil.tar');
    execFileSync('ln', ['-s', '/etc/passwd', join(dir, 'link')]);
    execFileSync('tar', ['-cf', evil, '-C', dir, 'link']);
    await expect(entries(evil)).rejects.toBeInstanceOf(TarFormatError);

    const traversal = join(dir, 'traversal.tar');
    await writeFile(join(dir, 'f'), 'x');
    execFileSync('tar', ['-cf', traversal, '-C', dir, '--transform', 's,^f$,../f,', 'f']);
    await expect(entries(traversal)).rejects.toThrow(/unsafe path/);

    const ok = join(dir, 'ok.tar');
    const w = await TarWriter.create(ok);
    await w.addBytes('a', new TextEncoder().encode('a'));
    await w.finish();
    const bytes = await readFile(ok);
    bytes[10] = 0x41;
    await writeFile(ok, bytes);
    await expect(entries(ok)).rejects.toThrow(/checksum/);
  });
});
