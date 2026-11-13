/** Messages between `WorkerEmbedder` and `embedder.worker.ts`. */
export type EmbedderDevice = 'webgpu' | 'wasm';

export type EmbedderRequest =
  | { type: 'load'; prefer: EmbedderDevice | 'auto' }
  | { type: 'embed'; id: number; texts: string[]; batchSize: number }
  | { type: 'cancel'; id: number };

export type EmbedderEvent =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready'; device: EmbedderDevice; loadMs: number }
  | { type: 'load_failed' }
  | { type: 'result'; id: number; vectors: Float32Array; count: number }
  | { type: 'failed'; id: number; cancelled: boolean };
