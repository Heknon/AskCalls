import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { z } from 'zod';
import { AGENT_CONFIG_KEYS, ensureDataDir, writePrivateFile } from '../config';
import { VERSION } from '../version';
import { assertNotRunning, hasLocalData, localPaths } from './layout';
import { readTar, TarFormatError, TarWriter } from './tar';

/**
 * `askcalls backup` / `askcalls restore` (spec 11.2c). The archive is a plain tar:
 *
 *   manifest.json   format, version, what each part is, and every file's size and SHA-256
 *   config.json     the instance settings with every secret removed (listed in the manifest)
 *   db/…            PGlite's data directory, copied while the server is stopped
 *   blobs/…         the fs blob store's encrypted recordings
 *
 * Everything in it is what the server already stores: ciphertext, wrapped keys and hashes. It is
 * useless without one of the user's unlock methods. A future `askcalls migrate --to <url>` reads
 * the same manifest and uploads the rows and blobs as they are.
 */
export const BACKUP_FORMAT = 'askcalls-local-backup';
export const BACKUP_VERSION = 1;

/**
 * Instance settings that are secrets (apps/web server/config/schema.ts SECRET_PATHS, kept equal
 * by backup.test.ts). They are not written to a backup.
 */
export const INSTANCE_SECRET_PATHS = [
  'auth.secret',
  'auth.google.secret',
  'auth.github.secret',
  'storage.google.secret',
  'auth.email.server',
  'cronSecret',
  'local.key',
  'db.url',
  'blob.s3.secretAccessKey',
  'transcription.keys.elevenlabs',
  'transcription.keys.openai',
  'transcription.keys.deepgram',
  'transcription.keys.soniox',
  'llm.apiKey',
  'telemetry.otel.headers',
  'telemetry.sentryDsn',
  'telemetry.posthog.key',
] as const;

const FileEntry = z.object({
  path: z.string(),
  bytes: z.number().int().min(0),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

const ManifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().positive(),
  createdAt: z.string(),
  agentVersion: z.string(),
  database: z.object({ engine: z.literal('pglite'), dir: z.literal('db') }),
  blobs: z.object({ driver: z.literal('fs'), dir: z.literal('blobs') }),
  config: z.object({ path: z.literal('config.json'), secretsRemoved: z.array(z.string()) }),
  /** Every directory under db/ and blobs/, empty ones included (Postgres needs them). */
  directories: z.array(z.string()),
  files: z.array(FileEntry),
});
export type BackupManifest = z.output<typeof ManifestSchema>;

type Json = Record<string, unknown>;

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

const toArchivePath = (root: string, full: string) => relative(root, full).split(sep).join('/');

/**
 * Directories and regular files under `dir`, skipping dot-files in `skipDotFiles` mode (blob
 * temp files and the presign key).
 */
async function listTree(
  dir: string,
  skipDotFiles: boolean,
): Promise<{ directories: string[]; files: string[] }> {
  const directories: string[] = [];
  const files: string[] = [];
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (skipDotFiles && e.name.startsWith('.')) continue;
      const full = join(d, e.name);
      if (e.isDirectory()) {
        directories.push(full);
        await walk(full);
      } else if (e.isFile()) files.push(full);
    }
  };
  if (await stat(dir).catch(() => null)) directories.push(dir);
  await walk(dir);
  return { directories: directories.sort(), files: files.sort() };
}

function deletePath(obj: Json, path: string): boolean {
  const keys = path.split('.');
  let cur: unknown = obj;
  for (const k of keys.slice(0, -1)) {
    if (!cur || typeof cur !== 'object') return false;
    cur = (cur as Json)[k];
  }
  if (!cur || typeof cur !== 'object' || !(keys.at(-1)! in (cur as Json))) return false;
  delete (cur as Json)[keys.at(-1)!];
  return true;
}

/** The instance part of config.json without its secrets, and the secret paths removed. */
export function backupConfig(file: Json): { config: Json; secretsRemoved: string[] } {
  const config = structuredClone(file);
  for (const k of AGENT_CONFIG_KEYS) delete config[k];
  const secretsRemoved = INSTANCE_SECRET_PATHS.filter((p) => deletePath(config, p));
  return { config, secretsRemoved };
}

async function readJson(path: string): Promise<Json> {
  try {
    const v: unknown = JSON.parse(await readFile(path, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
}

export interface BackupResult {
  file: string;
  files: number;
  bytes: number;
  secretsRemoved: string[];
}

/** Writes the backup of `dir` to `file`. Refuses while `askcalls local` runs. */
export async function createBackup(dir: string, file: string): Promise<BackupResult> {
  await assertNotRunning(dir);
  const p = localPaths(dir);
  if (!(await stat(join(p.db, 'PG_VERSION')).catch(() => null))) {
    throw new Error(`there is no local AskCalls data in ${dir}`);
  }
  const { config, secretsRemoved } = backupConfig(await readJson(p.config));
  const configBytes = new TextEncoder().encode(`${JSON.stringify(config, null, 2)}\n`);

  const db = await listTree(p.db, false);
  const blobs = await listTree(p.blobs, true);
  const directories = [...db.directories, ...blobs.directories].map((d) => toArchivePath(dir, d));
  const sources = [...db.files, ...blobs.files].map((full) => ({
    full,
    path: toArchivePath(dir, full),
  }));
  const planned = await Promise.all(
    sources.map(async (s) => {
      const st = await stat(s.full);
      return { ...s, bytes: st.size, mtime: st.mtimeMs, sha256: await sha256File(s.full) };
    }),
  );
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    agentVersion: VERSION,
    database: { engine: 'pglite', dir: 'db' },
    blobs: { driver: 'fs', dir: 'blobs' },
    config: { path: 'config.json', secretsRemoved },
    directories,
    files: [
      {
        path: 'config.json',
        bytes: configBytes.length,
        sha256: createHash('sha256').update(configBytes).digest('hex'),
      },
      ...planned.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
    ],
  };

  const part = `${file}.${randomBytes(4).toString('hex')}.part`;
  const tar = await TarWriter.create(part);
  try {
    await tar.addBytes(
      'manifest.json',
      new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    );
    await tar.addBytes('config.json', configBytes);
    for (const d of directories) await tar.addDirectory(d);
    for (const f of planned) {
      const digest = await tar.addFile(f.path, f.full, f.bytes, f.mtime);
      if (digest !== f.sha256) throw new Error(`${f.path} changed while it was archived`);
    }
    await tar.finish();
    await rename(part, file);
  } catch (e) {
    await tar.abort();
    await rm(part, { force: true });
    throw e;
  }
  return {
    file,
    files: manifest.files.length,
    bytes: manifest.files.reduce((n, f) => n + f.bytes, 0),
    secretsRemoved,
  };
}

export class BackupVersionError extends Error {
  constructor(version: number) {
    super(
      `this backup has format version ${version}; this askcalls reads version ${BACKUP_VERSION}. Update askcalls and try again.`,
    );
    this.name = 'BackupVersionError';
  }
}

export interface RestoreResult {
  files: number;
  createdAt: string;
  secretsRemoved: string[];
}

const RESTORABLE = /^(db|blobs)\//;
const RESTORABLE_DIR = /^(db|blobs)(\/|$)/;

/**
 * Restores a backup into `dir`: every file is checked against the manifest (size and SHA-256)
 * in a staging directory first, then swapped in. Refuses while `askcalls local` runs, and over
 * existing local data unless `force`. The agent's own settings in config.json are kept.
 */
export async function restoreBackup(
  dir: string,
  file: string,
  opts: { force?: boolean } = {},
): Promise<RestoreResult> {
  await assertNotRunning(dir);
  if (!opts.force && (await hasLocalData(dir))) {
    throw new Error(
      `${dir} already holds local AskCalls data. Restoring replaces it: run again with --force.`,
    );
  }
  await stat(file);
  await ensureDataDir(dir);
  const p = localPaths(dir);
  const staging = join(dir, `.restore-${randomBytes(6).toString('hex')}`);
  const previous = join(dir, `.replaced-${randomBytes(6).toString('hex')}`);

  try {
    let manifest: BackupManifest | null = null;
    let config: Json | null = null;
    const expected = new Map<string, z.output<typeof FileEntry>>();
    let directories = new Set<string>();
    const seen = new Set<string>();
    for await (const entry of readTar(file)) {
      if (!manifest) {
        if (entry.path !== 'manifest.json') throw new TarFormatError('no manifest');
        const raw = JSON.parse(new TextDecoder().decode(await entry.bytes(64 << 20))) as Json;
        if (raw.format !== BACKUP_FORMAT) throw new TarFormatError('not an AskCalls backup');
        if (raw.version !== BACKUP_VERSION) throw new BackupVersionError(Number(raw.version));
        manifest = ManifestSchema.parse(raw);
        for (const f of manifest.files) expected.set(f.path, f);
        directories = new Set(manifest.directories);
        continue;
      }
      if (entry.type === 'directory') {
        if (!directories.has(entry.path) || !RESTORABLE_DIR.test(entry.path)) {
          throw new TarFormatError(`${entry.path}/ does not match the manifest`);
        }
        await mkdir(join(staging, ...entry.path.split('/')), { recursive: true, mode: 0o700 });
        continue;
      }
      const want = expected.get(entry.path);
      if (!want || seen.has(entry.path) || want.bytes !== entry.size) {
        throw new TarFormatError(`${entry.path} does not match the manifest`);
      }
      seen.add(entry.path);
      if (entry.path === 'config.json') {
        const bytes = await entry.bytes(1 << 20);
        if (createHash('sha256').update(bytes).digest('hex') !== want.sha256) {
          throw new TarFormatError('config.json failed its checksum');
        }
        config = JSON.parse(new TextDecoder().decode(bytes)) as Json;
        continue;
      }
      if (!RESTORABLE.test(entry.path)) throw new TarFormatError(`unexpected ${entry.path}`);
      const digest = await entry.extractTo(join(staging, ...entry.path.split('/')));
      if (digest !== want.sha256) throw new TarFormatError(`${entry.path} failed its checksum`);
    }
    if (!manifest) throw new TarFormatError('empty');
    const missing = manifest.files.filter((f) => !seen.has(f.path));
    if (missing.length) throw new TarFormatError(`${missing.length} files are missing`);
    if (!(await stat(join(staging, 'db', 'PG_VERSION')).catch(() => null))) {
      throw new TarFormatError('no database');
    }

    await swapIn(p, staging, previous);
    const current = await readJson(p.config);
    const agent = Object.fromEntries(
      Object.entries(current).filter(([k]) => AGENT_CONFIG_KEYS.includes(k)),
    );
    await mkdir(dirname(p.config), { recursive: true });
    await writePrivateFile(p.config, `${JSON.stringify({ ...config, ...agent }, null, 2)}\n`);
    return {
      files: manifest.files.length,
      createdAt: manifest.createdAt,
      secretsRemoved: manifest.config.secretsRemoved,
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/**
 * Moves the current `db/` and `blobs/` aside, moves the staged ones in, then deletes the old
 * ones. If a move fails, what was moved goes back, so the data directory is never half restored.
 */
async function swapIn(p: ReturnType<typeof localPaths>, staging: string, previous: string) {
  await mkdir(previous, { recursive: true, mode: 0o700 });
  const parts = ['db', 'blobs'] as const;
  const done: Array<{ part: (typeof parts)[number]; hadOld: boolean }> = [];
  try {
    for (const part of parts) {
      const hadOld = await rename(p[part], join(previous, part)).then(
        () => true,
        (e: NodeJS.ErrnoException) => {
          if (e.code === 'ENOENT') return false;
          throw e;
        },
      );
      done.push({ part, hadOld });
      await mkdir(join(staging, part), { recursive: true, mode: 0o700 });
      await rename(join(staging, part), p[part]);
    }
  } catch (e) {
    for (const { part, hadOld } of done.reverse()) {
      await rm(p[part], { recursive: true, force: true });
      if (hadOld) await rename(join(previous, part), p[part]);
    }
    await rm(previous, { recursive: true, force: true });
    throw e;
  }
  await rm(previous, { recursive: true, force: true });
}
