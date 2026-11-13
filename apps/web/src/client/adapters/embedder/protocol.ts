/** Messages between `WorkerEmbedder` and `embedder.worker.ts`. */
export type EmbedderDevice = 'webgpu' | 'wasm';

export type EmbedderRequest =
  /** `modelUrl`: the build's directory (assets.ts `modelDirectoryUrl`). */
  | { type: 'load'; prefer: EmbedderDevice | 'auto'; modelUrl: string }
  | { type: 'embed'; id: number; texts: string[]; batchSize: number }
  | { type: 'cancel'; id: number };

export type EmbedderEvent =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready'; device: EmbedderDevice; loadMs: number }
  /** `verification`: a model file did not match its pinned SHA-256. */
  | { type: 'load_failed'; reason: 'verification' | 'other' }
  | { type: 'result'; id: number; vectors: Float32Array; count: number }
  | { type: 'failed'; id: number; cancelled: boolean };
