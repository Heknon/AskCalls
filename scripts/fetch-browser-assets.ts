/**
 * Places the browser's same-origin runtime assets under apps/web/public (spec 2.4):
 * - ONNX Runtime WebAssembly files, copied from the installed onnxruntime-web package;
 * - the ffmpeg.wasm core, copied from the installed @ffmpeg/core package;
 * - the pruned multilingual-e5-small build (scripts/models), at /models/e5-pruned/<build>/.
 *   It is downloaded prebuilt from EMBEDDING_MODEL_URL when that is set, otherwise built
 *   locally from the original model (downloaded once from Hugging Face) and the committed
 *   keep-set. Every file must match its SHA-256 in assets.ts; verified files are kept.
 *
 * Runs from `predev` and `prebuild` in apps/web. Environment:
 * - EMBEDDING_MODEL_URL: a model host with published builds (`bun run models:publish`).
 * - ASKCALLS_MODEL_MIRROR: base URL to download the original model from instead of
 *   huggingface.co (`<mirror>/<model id>/resolve/<revision>/<file>`), for air-gapped builds.
 * - ASKCALLS_SKIP_MODEL_DOWNLOAD=1: skip the model (CI jobs that never embed in a browser, and
 *   deployments whose browsers fetch it from EMBEDDING_MODEL_URL).
 */
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  EMBEDDING_MODEL,
  FFMPEG_BASE_PATH,
  FFMPEG_CORE_VERSION,
  FFMPEG_FILES,
  MODEL_BUILD_PATH,
  ORT_BASE_PATH,
  ORT_FILES,
  ORT_VERSION,
  SAME_ORIGIN_MODEL_BASE,
} from '../apps/web/src/client/assets';
import { buildPruned } from './models/build-e5';
import { download, verified } from './models/files';
import { sha256 } from './models/prune-e5';

const { EMBEDDING_MODEL_URL: prebuiltBase, ASKCALLS_SKIP_MODEL_DOWNLOAD: skipModel } = Bun.env;
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

async function placeModel() {
  const modelsDir = join(publicDir, SAME_ORIGIN_MODEL_BASE);
  const dir = join(modelsDir, MODEL_BUILD_PATH);
  await mkdir(modelsDir, { recursive: true });
  for (const entry of await readdir(modelsDir)) {
    if (entry !== 'e5-pruned') await rm(join(modelsDir, entry), { recursive: true, force: true });
  }
  for (const entry of await readdir(join(modelsDir, 'e5-pruned')).catch(() => [])) {
    if (entry !== EMBEDDING_MODEL.build) {
      await rm(join(modelsDir, 'e5-pruned', entry), { recursive: true, force: true });
    }
  }

  const missing = [];
  for (const f of EMBEDDING_MODEL.files) {
    if (!(await verified(join(dir, f.path), f))) missing.push(f);
  }
  if (missing.length === 0) return;

  if (prebuiltBase) {
    const base = new URL(MODEL_BUILD_PATH, `${prebuiltBase.replace(/\/+$/, '')}/`).href;
    for (const f of missing) {
      console.log(`fetch-browser-assets: downloading ${f.path} (${(f.bytes / 1e6).toFixed(1)} MB)`);
      await download(new URL(f.path, base).href, join(dir, f.path), f);
    }
    return;
  }

  console.log('fetch-browser-assets: building the pruned embedding model');
  const { files, manifest } = await buildPruned();
  if (manifest.build !== EMBEDDING_MODEL.build) {
    throw new Error(
      `pruned build ${manifest.build} does not match assets.ts (${EMBEDDING_MODEL.build}); run bun scripts/models/build-e5.ts and update the pins`,
    );
  }
  for (const f of missing) {
    const bytes = files.get(f.path)!;
    if (bytes.length !== f.bytes || sha256(bytes) !== f.sha256) {
      throw new Error(`${f.path}: built file does not match its pin`);
    }
    await mkdir(dirname(join(dir, f.path)), { recursive: true });
    await Bun.write(join(dir, f.path), bytes);
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
    await placeModel();
  }
}

main().catch((e) => {
  console.error(`fetch-browser-assets: ${(e as Error).message}`);
  process.exit(1);
});
