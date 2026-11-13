/** Messages between `FfmpegClient` and `ffmpeg.worker.ts`. Bytes are transferred, not copied. */
export interface FfmpegJob {
  id: number;
  args: string[];
  input: { name: string; bytes: Uint8Array };
  output: string;
}

export type FfmpegReply =
  | { id: number; ok: true; bytes: Uint8Array }
  | { id: number; ok: false; code: 'load_failed' | 'exec_failed'; exitCode?: number };
