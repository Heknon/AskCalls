/**
 * Places the browser's self-hosted runtime assets under apps/web/public (spec 2.4):
 * - ONNX Runtime WebAssembly files, copied from the installed onnxruntime-web package;
 * - the ffmpeg.wasm core, copied from the installed @ffmpeg/core package;
 * - the multilingual-e5-small model, downloaded once from Hugging Face at a pinned revision.
 * Every model file is checked against its SHA-256; existing verified files are kept.
 *
 * Runs from `predev` and `prebuild` in apps/web. Environment:
 * - ASKCALLS_MODEL_MIRROR: base URL to download model files from instead of huggingface.co
 *   (`<mirror>/<model id>/resolve/<revision>/<file>`), for air-gapped builds.
 * - ASKCALLS_SKIP_MODEL_DOWNLOAD=1: skip the model (CI jobs that never embed in a browser).
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  EMBEDDING_MODEL,
  FFMPEG_BASE_PATH,
  FFMPEG_CORE_VERSION,
  FFMPEG_FILES,
  MODEL_BASE_PATH,
  ORT_BASE_PATH,
  ORT_FILES,
  ORT_VERSION,
} from '../apps/web/src/client/assets';

const { ASKCALLS_MODEL_MIRROR: modelMirror, ASKCALLS_SKIP_MODEL_DOWNLOAD: skipModel } = Bun.env;
const webDir = join(import.meta.dir, '..', 'apps', 'web');
const publicDir = join(webDir, 'public');
const requireFromWeb = createRequire(join(webDir, 'package.json'));

async function packageDir(require: NodeRequire, name: string, version: string): Promise<string> {
  let dir = dirname(require.resolve(name));
  while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir);
  const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
  };
  if (pkg.name !== name || pkg.version !== version) {
    throw new Error(
      `${name}: installed ${pkg.version}, assets.ts expects ${version}. Update apps/web/src/client/assets.ts.`,
    );
  }
  return dir;
}

async function copyAll(fromDir: string, files: readonly string[], toPath: string) {
  const out = join(publicDir, toPath);
  await mkdir(out, { recursive: true });
  for (const f of files) {
    const target = join(out, f);
    const src = join(fromDir, f);
    const [a, b] = await Promise.all([stat(src), stat(target).catch(() => null)]);
    if (b && b.size === a.size && b.mtimeMs >= a.mtimeMs) continue;
    await copyFile(src, target);
  }
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

async function verified(path: string, bytes: number, sha256: string): Promise<boolean> {
  const s = await stat(path).catch(() => null);
  return !!s && s.size === bytes && (await sha256File(path)) === sha256;
}

async function download(url: string, target: string, bytes: number, sha256: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`GET ${url}: HTTP ${res.status}`);
  const tmp = `${target}.part`;
  const h = createHash('sha256');
  const writer = Bun.file(tmp).writer();
  let n = 0;
  let lastLog = 0;
  for await (const part of res.body) {
    h.update(part);
    writer.write(part);
    n += part.length;
    if (bytes > 10_000_000 && n - lastLog > 20_000_000) {
      lastLog = n;
      console.log(`  ${Math.round((100 * n) / bytes)}%`);
    }
  }
  await writer.end();
  const digest = h.digest('hex');
  if (n !== bytes || digest !== sha256) {
    await rm(tmp, { force: true });
    throw new Error(`${url}: got ${n} bytes sha256 ${digest}, expected ${bytes} ${sha256}`);
  }
  await rename(tmp, target);
}

async function fetchModel() {
  const base = (modelMirror ?? 'https://huggingface.co').replace(/\/+$/, '');
  const dir = join(publicDir, MODEL_BASE_PATH, EMBEDDING_MODEL.id);
  for (const f of EMBEDDING_MODEL.files) {
    const target = join(dir, f.path);
    if (await verified(target, f.bytes, f.sha256)) continue;
    await mkdir(dirname(target), { recursive: true });
    const url = `${base}/${EMBEDDING_MODEL.id}/resolve/${EMBEDDING_MODEL.revision}/${f.path}`;
    console.log(`fetch-browser-assets: downloading ${f.path} (${(f.bytes / 1e6).toFixed(1)} MB)`);
    await download(url, target, f.bytes, f.sha256);
  }
}

async function main() {
  const transformers = await packageDir(requireFromWeb, '@huggingface/transformers', '4.3.2');
  const ort = await packageDir(
    createRequire(join(transformers, 'package.json')),
    'onnxruntime-web',
    ORT_VERSION,
  );
  await copyAll(join(ort, 'dist'), ORT_FILES, ORT_BASE_PATH);
  const ffmpeg = await packageDir(requireFromWeb, '@ffmpeg/core', FFMPEG_CORE_VERSION);
  await copyAll(join(ffmpeg, 'dist', 'esm'), FFMPEG_FILES, FFMPEG_BASE_PATH);

  if (skipModel === '1') {
    console.log(
      'fetch-browser-assets: skipping the embedding model (ASKCALLS_SKIP_MODEL_DOWNLOAD)',
    );
  } else {
    await fetchModel();
  }
}

main().catch((e) => {
  console.error(`fetch-browser-assets: ${(e as Error).message}`);
  process.exit(1);
});
