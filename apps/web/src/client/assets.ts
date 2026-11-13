/**
 * Self-hosted runtime assets (spec 2.4): the embedding model, the ONNX Runtime WebAssembly
 * build and the ffmpeg.wasm core are served from this app's origin, never from a CDN.
 * `scripts/fetch-browser-assets.ts` places them under `apps/web/public` at these paths and
 * verifies every file against the hashes below. Paths carry the version, so they are cached
 * as immutable.
 */

export interface AssetFile {
  path: string;
  bytes: number;
  sha256: string;
}

export const EMBEDDING_MODEL = {
  id: 'Xenova/multilingual-e5-small',
  /** Hugging Face commit the files are pinned to. */
  revision: '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
  /** 8-bit weights (`onnx/model_quantized.onnx`) on every device, so vectors agree. */
  dtype: 'q8',
  dimensions: 384,
  files: [
    {
      path: 'config.json',
      bytes: 658,
      sha256: 'cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1',
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
      bytes: 17_082_730,
      sha256: '0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39',
    },
    {
      path: 'onnx/model_quantized.onnx',
      bytes: 118_308_185,
      sha256: 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193',
    },
  ] satisfies AssetFile[],
} as const;

/** `env.localModelPath`: transformers.js appends `<model id>/<file>`. */
export const MODEL_BASE_PATH = `/models/${EMBEDDING_MODEL.revision.slice(0, 12)}/`;

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

/** Every self-hosted asset lives under one of these prefixes (immutable cache headers). */
export const ASSET_PREFIXES = ['/models/', '/ort/', '/ffmpeg/'] as const;
