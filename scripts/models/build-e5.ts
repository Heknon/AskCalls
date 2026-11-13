/**
 * Builds the pruned model from the original files and the committed keep-set:
 *
 *   bun scripts/models/build-e5.ts [outDir]
 *
 * writes `<outDir>/<build hash>/…` (default outDir: the model cache) plus `manifest.json`, and
 * prints the manifest. The pins in apps/web/src/client/assets.ts and the agent's embedder must
 * equal it; `fetch-browser-assets` and `models:publish` refuse files that don't match.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildHash, type PrunedFile, parseKeepSet, prune, SOURCE_MODEL, sha256 } from './prune-e5';
import { cacheDir, KEEP_SET_FILE, sourceModel } from './source';

export interface BuildManifest {
  source: { id: string; revision: string };
  keepSet: { rows: number; sha256: string };
  build: string;
  files: PrunedFile[];
}

/** Prunes the original model; returns the files and their manifest, writing nothing. */
export async function buildPruned(): Promise<{
  manifest: BuildManifest;
  files: Map<string, Uint8Array>;
}> {
  const keepText = await readFile(KEEP_SET_FILE, 'utf8');
  const keep = parseKeepSet(keepText);
  const { files, manifest } = prune(await sourceModel(), keep);
  return {
    files,
    manifest: {
      source: { id: SOURCE_MODEL.id, revision: SOURCE_MODEL.revision },
      keepSet: { rows: keep.length, sha256: sha256(keepText) },
      build: buildHash(manifest),
      files: manifest,
    },
  };
}

/** Writes a build under `<outDir>/<build>/`; returns that directory. */
export async function writeBuild(
  outDir: string,
  build: Awaited<ReturnType<typeof buildPruned>>,
): Promise<string> {
  const dir = join(outDir, build.manifest.build);
  for (const [path, bytes] of build.files) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await Bun.write(join(dir, path), bytes);
  }
  await Bun.write(join(dir, 'manifest.json'), `${JSON.stringify(build.manifest, null, 2)}\n`);
  return dir;
}

if (import.meta.main) {
  const outDir = process.argv[2] ?? join(cacheDir, 'e5-pruned');
  const build = await buildPruned();
  const dir = await writeBuild(outDir, build);
  console.log(JSON.stringify(build.manifest, null, 2));
  console.log(`models: wrote ${dir}`);
}
