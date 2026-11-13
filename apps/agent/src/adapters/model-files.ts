import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DomainError } from '@askcalls/domain';

/**
 * The embedding model files, pinned exactly like the browser's (apps/web/src/client/assets.ts,
 * checked by model-files.test.ts): the same pruned multilingual-e5-small build, so the agent
 * and the browser produce the same vectors.
 */
export const EMBEDDING_MODEL = {
  id: 'Xenova/multilingual-e5-small',
  build: '0c5a50de057d0d47',
  dtype: 'q8',
  files: [
    {
      path: 'config.json',
      bytes: 564,
      sha256: '7b64b4f7c522ee67a392090c5298300980b5b977e8581d9ff4090fda1d4a5db7',
    },
    {
      path: 'tokenizer_config.json',
      bytes: 443,
      sha256: 'a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b',
    },
    {
      path: 'special_tokens_map.json',
      bytes: 167,
      sha256: 'd05497f1da52c5e09554c0cd874037a083e1dc1b9cfd48034d1c717f1afc07a7',
    },
    {
      path: 'tokenizer.json',
      bytes: 1_387_736,
      sha256: '51f0e573c05ffe38c6073bb4b09d24b51c6ad87eeebb5d7c70c9aeb7fc1c729a',
    },
    {
      path: 'onnx/model_quantized.onnx',
      bytes: 34_285_913,
      sha256: '2ae6cdb83c25aeea0e65fb6fad23f037b8d6712e174c717371daff5ece743686',
    },
  ],
} as const;

export const EMBEDDING_MODEL_ID = `${EMBEDDING_MODEL.id}@pruned-${EMBEDDING_MODEL.build}`;

/** Where builds are published (`bun run models:publish`): the host when none is given. */
export const DEFAULT_MODEL_URL = 'https://models.askcalls.com';

type PinnedFile = (typeof EMBEDDING_MODEL.files)[number];

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

async function matches(path: string, f: PinnedFile): Promise<boolean> {
  const s = await stat(path).catch(() => null);
  return !!s && s.size === f.bytes && (await sha256File(path)) === f.sha256;
}

async function download(url: string, target: string, f: PinnedFile): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new DomainError('provider_error', 'model file not available');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (bytes.byteLength !== f.bytes || digest !== f.sha256) {
    throw new DomainError('invalid', 'model file failed verification');
  }
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(`${target}.part`, bytes);
  await rename(`${target}.part`, target);
}

/**
 * Makes sure `<modelsDir>/e5-pruned/<build>/` holds the pinned files, downloading what is
 * missing from `<base>/e5-pruned/<build>/`, and checks every file's SHA-256 before the
 * runtime loads it. Returns transformers.js's `localModelPath` and model name for that build.
 */
export async function ensureModelFiles(
  modelsDir: string,
  opts: { baseUrl?: string; log: (line: string) => void },
): Promise<{ localModelPath: string; model: string }> {
  const localModelPath = join(modelsDir, 'e5-pruned');
  const dir = join(localModelPath, EMBEDDING_MODEL.build);
  const base = `${(opts.baseUrl || DEFAULT_MODEL_URL).replace(/\/+$/, '')}/e5-pruned/${EMBEDDING_MODEL.build}/`;
  let announced = false;
  for (const f of EMBEDDING_MODEL.files) {
    const target = join(dir, f.path);
    if (await matches(target, f)) continue;
    await rm(target, { force: true });
    if (!announced) {
      opts.log('askcalls: downloading the embedding model (once, about 36 MB)…');
      announced = true;
    }
    await download(new URL(f.path, base).href, target, f);
  }
  return { localModelPath, model: EMBEDDING_MODEL.build };
}
