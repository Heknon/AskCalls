import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { download, verified } from './files';
import { SOURCE_MODEL } from './prune-e5';

const { ASKCALLS_MODEL_CACHE: cacheEnv, ASKCALLS_MODEL_MIRROR: mirror } = Bun.env;
const root = join(import.meta.dir, '..', '..');

export const KEEP_SET_FILE = join(import.meta.dir, 'e5-keep-set.txt');

/** Downloads, corpora and the original model live here; never committed. */
export const cacheDir = cacheEnv ?? join(root, 'node_modules', '.cache', 'askcalls-models');
export const sourceDir = join(cacheDir, 'source', SOURCE_MODEL.revision.slice(0, 12));

/**
 * The original files, downloaded once from Hugging Face (or ASKCALLS_MODEL_MIRROR, laid out as
 * `<mirror>/<model id>/resolve/<revision>/<file>`) and checked against their pins.
 */
export async function sourceModel(): Promise<Map<string, Uint8Array>> {
  const base = (mirror ?? 'https://huggingface.co').replace(/\/+$/, '');
  const out = new Map<string, Uint8Array>();
  for (const f of SOURCE_MODEL.files) {
    const target = join(sourceDir, f.path);
    if (!(await verified(target, f))) {
      console.log(`models: downloading original ${f.path} (${(f.bytes / 1e6).toFixed(1)} MB)`);
      await download(
        `${base}/${SOURCE_MODEL.id}/resolve/${SOURCE_MODEL.revision}/${f.path}`,
        target,
        f,
      );
    }
    out.set(f.path, new Uint8Array(await readFile(target)));
  }
  return out;
}
