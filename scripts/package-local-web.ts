/**
 * Builds the web bundle `askcalls local` runs (apps/agent/src/local/web-bundle.ts) from the
 * Next.js standalone build (`bun run --cwd apps/web build` first):
 *
 *   apps/agent/web/
 *     apps/web/server.js, .next/, node_modules/   the standalone server
 *     apps/web/.next/static/                       client chunks
 *     apps/web/public/                             model, ONNX Runtime, ffmpeg.wasm, fonts, icons
 *     apps/web/local-server.mjs                    the loopback-guarded entry
 *     node_modules/                                traced dependencies, hoisted, no symlinks
 *     packages/                                    traced workspace package manifests
 *     bundle.json                                  agent version and a SHA-256 of every file
 *
 * The npm package ships that directory. With `--archive <file.tar.gz>` it also writes the
 * archive the single binary downloads, and prints its SHA-256 for scripts/build-agent-binary.ts.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { cp, lstat, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { createGzip } from 'node:zlib';
import agentPkg from '../apps/agent/package.json' with { type: 'json' };
import { TarWriter } from '../apps/agent/src/local/tar';

const root = join(import.meta.dir, '..');
const web = join(root, 'apps', 'web');
const standalone = join(web, '.next', 'standalone');
const out = join(root, 'apps', 'agent', 'web');

const { values } = parseArgs({ options: { archive: { type: 'string' } } });

async function sha256(path: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest('hex');
}

async function files(dir: string): Promise<string[]> {
  const list: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) list.push(join(e.parentPath, e.name));
  }
  return list.sort();
}

if (!existsSync(join(standalone, 'apps', 'web', 'server.js'))) {
  console.error('No standalone build: run bun run --cwd apps/web build first.');
  process.exit(1);
}
for (const dir of ['models', 'ort', 'ffmpeg', 'fonts']) {
  if (!existsSync(join(web, 'public', dir))) {
    console.error(`apps/web/public/${dir} is missing: the build did not fetch the browser assets.`);
    process.exit(1);
  }
}

/**
 * Bun's isolated install leaves the traced packages in `node_modules/.bun/<pkg>@<v>/node_modules`
 * joined by symlinks, which npm packages cannot carry. Hoist each one to `node_modules/<name>`,
 * as npm would: the server resolves them from there, each package exactly once.
 */
async function hoistPackages(store: string, target: string) {
  const seen = new Map<string, string>();
  for (const entry of await readdir(store)) {
    const nm = join(store, entry, 'node_modules');
    if (entry === 'node_modules' || !existsSync(nm)) continue;
    const names: string[] = [];
    for (const n of await readdir(nm)) {
      if (n.startsWith('@')) names.push(...(await readdir(join(nm, n))).map((s) => `${n}/${s}`));
      else names.push(n);
    }
    for (const name of names) {
      const src = join(nm, name);
      if ((await lstat(src)).isSymbolicLink()) continue;
      const other = seen.get(name);
      if (other)
        throw new Error(`${name} is traced twice (${other} and ${entry}); add a nested copy`);
      seen.set(name, entry);
      await cp(src, join(target, name), { recursive: true, dereference: true });
    }
  }
  return seen.size;
}

await rm(out, { recursive: true, force: true });
await cp(standalone, out, {
  recursive: true,
  filter: (src) => !src.split(sep).includes('node_modules'),
});
const hoisted = await hoistPackages(
  join(standalone, 'node_modules', '.bun'),
  join(out, 'node_modules'),
);
const app = join(out, 'apps', 'web');
await rm(join(app, 'public'), { recursive: true, force: true });
await cp(join(web, 'public'), join(app, 'public'), { recursive: true, dereference: true });
await cp(join(web, '.next', 'static'), join(app, '.next', 'static'), { recursive: true });
await cp(join(web, 'local-server.mjs'), join(app, 'local-server.mjs'));

const all = await files(out);
const manifest = {
  format: 1,
  agentVersion: agentPkg.version,
  files: await Promise.all(
    all.map(async (f) => ({
      path: relative(out, f).split(sep).join('/'),
      bytes: (await stat(f)).size,
      sha256: await sha256(f),
    })),
  ),
};
await writeFile(join(out, 'bundle.json'), `${JSON.stringify(manifest)}\n`);
const total = manifest.files.reduce((n, f) => n + f.bytes, 0);
console.log(
  `apps/agent/web: ${manifest.files.length} files, ${hoisted} packages, ${(total / 2 ** 20).toFixed(0)} MiB`,
);

if (values.archive) {
  const tarPath = `${values.archive}.tar.tmp`;
  const tar = await TarWriter.create(tarPath);
  for (const f of [...all, join(out, 'bundle.json')]) {
    const s = await stat(f);
    await tar.addFile(relative(out, f).split(sep).join('/'), f, s.size, s.mtimeMs);
  }
  await tar.finish();
  await mkdir(join(values.archive, '..'), { recursive: true });
  await pipeline(
    createReadStream(tarPath),
    createGzip({ level: 9 }),
    createWriteStream(values.archive),
  );
  await rm(tarPath);
  console.log(`${values.archive}`);
  console.log(`sha256 ${await sha256(values.archive)}`);
}
