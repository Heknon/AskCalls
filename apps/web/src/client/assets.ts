/**
 * Browser runtime assets (spec 2.4). ONNX Runtime and the ffmpeg.wasm core always come from this
 * app's origin: they execute. The embedding model is data: it comes from this origin by default
 * (self-host, offline, development) or from `EMBEDDING_MODEL_URL` when the instance sets one
 * (the hosted site serves it from a bucket). Either way every model file is checked against the
 * SHA-256 below before ONNX Runtime or the tokenizer sees it. `scripts/fetch-browser-assets.ts`
 * places the files under `apps/web/public`; paths carry a version or content hash, so they are
 * cached as immutable.
 */

export interface AssetFile {
  path: string;
  bytes: number;
  sha256: string;
}

/**
 * multilingual-e5-small, 8-bit, with the vocabulary pruned to Hebrew, English, Arabic and
 * Russian (scripts/models/README.md). The agent's embedder pins the same files.
 */
export const EMBEDDING_MODEL = {
  /** The upstream model the files are derived from. */
  id: 'Xenova/multilingual-e5-small',
  /** Content address of the pruned build: `e5-pruned/<build>/` on every host. */
  build: '0c5a50de057d0d47',
  /** scripts/models/e5-keep-set.txt the build was pruned with. */
  keepSet: {
    rows: 31_229,
    sha256: '409381efc0e9ce6c87352acd351baf6c21b4c505cc8fc34613f4c9a36b4756fe',
  },
  dtype: 'q8',
  dimensions: 384,
  /**
   * Cosine similarity under which a call chunk is unrelated to a query. The model scores every
   * pair between about 0.7 and 0.9, so unrelated calls never score near 0
   * (`bun run models:calibrate`).
   */
  minSimilarity: 0.78,
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
  ] satisfies AssetFile[],
} as const;

/** Embedder model id: the upstream model and the pruned build, shared with the agent. */
export const EMBEDDING_MODEL_ID = `${EMBEDDING_MODEL.id}@pruned-${EMBEDDING_MODEL.build}`;

/** Where `scripts/models` publishes a build, relative to a model host's base URL. */
export const MODEL_BUILD_PATH = `e5-pruned/${EMBEDDING_MODEL.build}/`;

/** Same-origin model files (self-host, offline, development). */
export const SAME_ORIGIN_MODEL_BASE = '/models/';

/**
 * Directory URL the worker fetches the model from: `<base>/e5-pruned/<build>/`. `base` is the
 * instance's `EMBEDDING_MODEL_URL`, or this origin's `/models/` when it has none.
 */
export function modelDirectoryUrl(base: string | null, origin: string): string {
  const root = new URL(base ?? SAME_ORIGIN_MODEL_BASE, origin).href.replace(/\/*$/, '/');
  return new URL(MODEL_BUILD_PATH, root).href;
}

/** Must match the onnxruntime-web version @huggingface/transformers resolves to. */
export const ORT_VERSION = '1.31.0-dev.20260914-8d85527a0';
export const ORT_BASE_PATH = `/ort/${ORT_VERSION}/`;
/** The asyncify build runs WebGPU and WASM; the plain one is smaller and WASM-only. */
export const ORT_FILES = [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
] as const;

/** Single-threaded core (no SharedArrayBuffer, so no cross-origin isolation needed). */
export const FFMPEG_CORE_VERSION = '0.12.10';
export const FFMPEG_BASE_PATH = `/ffmpeg/${FFMPEG_CORE_VERSION}/`;
export const FFMPEG_FILES = ['ffmpeg-core.js', 'ffmpeg-core.wasm'] as const;

/** Every same-origin asset lives under one of these prefixes (immutable cache headers). */
export const ASSET_PREFIXES = ['/models/', '/ort/', '/ffmpeg/'] as const;
