import { DomainError } from '@askcalls/domain';
import type { FfmpegJob, FfmpegReply } from './ffmpeg-protocol';

/**
 * ffmpeg.wasm in a dedicated worker, created on first use (the core is ~32 MB). Jobs run one at
 * a time inside the worker.
 */
export class FfmpegClient {
  #worker: Worker | null = null;
  #next = 1;
  #pending = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: unknown) => void }>();

  constructor(
    private readonly createWorker: () => Worker = () =>
      new Worker(new URL('./ffmpeg.worker.ts', import.meta.url), {
        type: 'module',
        name: 'askcalls-ffmpeg',
      }),
  ) {}

  run(args: string[], input: { name: string; bytes: Uint8Array }, output: string) {
    const worker = this.#ensure();
    const id = this.#next++;
    const bytes = new Uint8Array(input.bytes);
    const job: FfmpegJob = { id, args, input: { name: input.name, bytes }, output };
    return new Promise<Uint8Array>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      worker.postMessage(job, [bytes.buffer]);
    });
  }

  /** Any format ffmpeg reads → 16 kHz mono float32 PCM. */
  async decodeToPcm16k(bytes: Uint8Array): Promise<Float32Array> {
    const out = await this.run(
      [
        '-hide_banner',
        '-nostdin',
        '-i',
        'input',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-f',
        'f32le',
        'output.pcm',
      ],
      { name: 'input', bytes },
      'output.pcm',
    );
    return new Float32Array(out.buffer, out.byteOffset, Math.floor(out.byteLength / 4));
  }

  /** 16 kHz mono PCM → Ogg Opus (libopus, VoIP tuning, 20 ms frames). */
  async encodeOpus(pcm: Float32Array, bitrateKbps: number): Promise<Uint8Array> {
    const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    return this.run(
      [
        '-hide_banner',
        '-nostdin',
        '-f',
        'f32le',
        '-ar',
        '16000',
        '-ac',
        '1',
        '-i',
        'input.pcm',
        '-c:a',
        'libopus',
        '-b:a',
        `${bitrateKbps}k`,
        '-application',
        'voip',
        '-frame_duration',
        '20',
        '-map_metadata',
        '-1',
        '-f',
        'ogg',
        'output.ogg',
      ],
      { name: 'input.pcm', bytes },
      'output.ogg',
    );
  }

  terminate(): void {
    this.#worker?.terminate();
    this.#worker = null;
    for (const p of this.#pending.values()) {
      p.reject(new DomainError('unsupported', 'audio converter stopped'));
    }
    this.#pending.clear();
  }

  #ensure(): Worker {
    if (this.#worker) return this.#worker;
    const w = this.createWorker();
    w.onmessage = ({ data }: MessageEvent<FfmpegReply>) => {
      const p = this.#pending.get(data.id);
      if (!p) return;
      this.#pending.delete(data.id);
      if (data.ok) p.resolve(data.bytes);
      else
        p.reject(
          new DomainError(
            data.code === 'load_failed' ? 'unsupported' : 'invalid',
            data.code === 'load_failed'
              ? 'audio converter failed to load'
              : 'audio conversion failed',
            { exitCode: data.exitCode ?? null },
          ),
        );
    };
    w.onerror = () => this.terminate();
    this.#worker = w;
    return w;
  }
}
