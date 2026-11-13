import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SECRET_PATHS } from '../../../web/src/server/config/schema';
import { loadConfig, saveConfig } from '../config';
import {
  BACKUP_FORMAT,
  BackupVersionError,
  createBackup,
  INSTANCE_SECRET_PATHS,
  restoreBackup,
} from './backup';
import { localPaths, writeRunning } from './layout';
import { TarWriter } from './tar';

const temp = () => mkdtemp(join(tmpdir(), 'askcalls-backup-'));

const INSTANCE = {
  llm: { provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: 'sk-x' },
  transcription: { provider: 'none', keys: { openai: 'sk-y' } },
  offlineMode: true,
};

async function seed(dir: string) {
  const p = localPaths(dir);
  await mkdir(join(p.db, 'base', '1'), { recursive: true });
  await writeFile(join(p.db, 'PG_VERSION'), '17\n');
  await writeFile(join(p.db, 'base', '1', '1259'), new Uint8Array(70_000).fill(7));
  await mkdir(join(p.blobs, 'users', 'u1', 'calls', 'c1'), { recursive: true });
  await writeFile(join(p.blobs, 'users', 'u1', 'calls', 'c1', 'rec.blob'), 'ciphertext');
  await writeFile(join(p.blobs, '.signing-key'), 'presign-secret');
  await writeFile(join(p.blobs, 'users', 'u1', '.tmp-abc'), 'partial');
  await writeFile(p.config, JSON.stringify(INSTANCE));
  await saveConfig(dir, { server: 'http://localhost:4317', deviceLabel: 'Laptop agent' });
  await writeFile(p.sessionSecret, 'cookie-secret');
}

describe('askcalls backup and restore', () => {
  it('keeps the instance secret list equal to the web app', () => {
    expect([...INSTANCE_SECRET_PATHS].sort()).toEqual([...SECRET_PATHS].sort());
  });

  it('writes a versioned, checksummed tar of the encrypted data without secrets', async () => {
    const dir = await temp();
    await seed(dir);
    const file = join(dir, '..', `${Date.now()}-backup.tar`);
    const r = await createBackup(dir, file);
    expect(r.secretsRemoved).toEqual(['transcription.keys.openai', 'llm.apiKey']);

    const listed = execFileSync('tar', ['-tf', file], { encoding: 'utf8' }).trim().split('\n');
    expect(listed).toEqual([
      'manifest.json',
      'config.json',
      'db/',
      'db/base/',
      'db/base/1/',
      'blobs/',
      'blobs/users/',
      'blobs/users/u1/',
      'blobs/users/u1/calls/',
      'blobs/users/u1/calls/c1/',
      'db/PG_VERSION',
      'db/base/1/1259',
      'blobs/users/u1/calls/c1/rec.blob',
    ]);
    const manifest = JSON.parse(
      execFileSync('tar', ['-xOf', file, 'manifest.json'], { encoding: 'utf8' }),
    );
    expect(manifest).toMatchObject({
      format: BACKUP_FORMAT,
      version: 1,
      database: { engine: 'pglite', dir: 'db' },
      blobs: { driver: 'fs', dir: 'blobs' },
      config: { path: 'config.json', secretsRemoved: ['transcription.keys.openai', 'llm.apiKey'] },
    });
    expect(manifest.directories).toEqual(listed.slice(2, 10).map((d) => d.slice(0, -1)));
    expect(manifest.files.map((f: { path: string }) => f.path)).toEqual([
      'config.json',
      ...listed.slice(10),
    ]);
    const config = execFileSync('tar', ['-xOf', file, 'config.json'], { encoding: 'utf8' });
    expect(JSON.parse(config)).toEqual({
      llm: { provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:11434/v1' },
      transcription: { provider: 'none', keys: {} },
      offlineMode: true,
    });
    const all = execFileSync('tar', ['-xOf', file], { encoding: 'utf8' });
    for (const secret of ['sk-x', 'sk-y', 'presign-secret', 'cookie-secret', 'Laptop agent']) {
      expect(all).not.toContain(secret);
    }
  });

  it('refuses while askcalls local runs, and without local data', async () => {
    const dir = await temp();
    await expect(createBackup(dir, join(dir, 'b.tar'))).rejects.toThrow(/no local AskCalls data/);
    await seed(dir);
    await writeRunning(dir, {
      pid: process.pid,
      serverPid: process.pid,
      port: 4317,
      startedAt: new Date().toISOString(),
    });
    await expect(createBackup(dir, join(dir, 'b.tar'))).rejects.toThrow(/is running/);
    await expect(restoreBackup(dir, join(dir, 'b.tar'), { force: true })).rejects.toThrow(
      /is running/,
    );
  });

  it('restores into an empty directory, keeps the agent settings there, and needs --force over data', async () => {
    const source = await temp();
    await seed(source);
    const file = join(source, '..', `${Date.now()}-restore.tar`);
    await createBackup(source, file);

    const target = await temp();
    await saveConfig(target, { deviceLabel: 'New laptop' });
    const r = await restoreBackup(target, file);
    expect(r.secretsRemoved).toEqual(['transcription.keys.openai', 'llm.apiKey']);
    const p = localPaths(target);
    expect(await readFile(join(p.db, 'base', '1', '1259'))).toEqual(
      Buffer.from(new Uint8Array(70_000).fill(7)),
    );
    expect(await readFile(join(p.blobs, 'users', 'u1', 'calls', 'c1', 'rec.blob'), 'utf8')).toBe(
      'ciphertext',
    );
    const config = JSON.parse(await readFile(p.config, 'utf8'));
    expect(config.llm).toEqual({
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:11434/v1',
    });
    expect((await loadConfig(target)).deviceLabel).toBe('New laptop');

    await expect(restoreBackup(target, file)).rejects.toThrow(/--force/);
    await writeFile(join(p.blobs, 'users', 'u1', 'calls', 'c1', 'rec.blob'), 'changed');
    await restoreBackup(target, file, { force: true });
    expect(await readFile(join(p.blobs, 'users', 'u1', 'calls', 'c1', 'rec.blob'), 'utf8')).toBe(
      'ciphertext',
    );
  });

  it('rejects a tampered archive and leaves the data there untouched', async () => {
    const source = await temp();
    await seed(source);
    const file = join(source, '..', `${Date.now()}-tampered.tar`);
    await createBackup(source, file);
    const bytes = await readFile(file);
    const at = bytes.indexOf(Buffer.from('ciphertext'));
    bytes[at] = 'X'.charCodeAt(0);
    await writeFile(file, bytes);

    const target = await temp();
    await seed(target);
    await writeFile(join(localPaths(target).db, 'PG_VERSION'), 'mine\n');
    await expect(restoreBackup(target, file, { force: true })).rejects.toThrow(/checksum/);
    expect(await readFile(join(localPaths(target).db, 'PG_VERSION'), 'utf8')).toBe('mine\n');
  });

  it('refuses another format version and other archives', async () => {
    const dir = await temp();
    const newer = join(dir, 'newer.tar');
    const w = await TarWriter.create(newer);
    await w.addBytes(
      'manifest.json',
      new TextEncoder().encode(JSON.stringify({ format: BACKUP_FORMAT, version: 2 })),
    );
    await w.finish();
    await expect(restoreBackup(join(dir, 'target'), newer)).rejects.toBeInstanceOf(
      BackupVersionError,
    );

    const other = join(dir, 'other.tar');
    const o = await TarWriter.create(other);
    await o.addBytes('readme.txt', new TextEncoder().encode('hello'));
    await o.finish();
    await expect(restoreBackup(join(dir, 'target'), other)).rejects.toThrow(/no manifest/);
  });
});
