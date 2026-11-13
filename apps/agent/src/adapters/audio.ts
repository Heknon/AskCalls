import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import type { AudioCodec, AudioSource, DecodedAudio, EncodedAudio } from '@askcalls/client-core';
import { DomainError } from '@askcalls/domain';

const SAMPLE_RATE = 16_000;

async function onPath(name: string): Promise<string | null> {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, exe);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

/** The system ffmpeg when one is on PATH, otherwise the binary bundled by ffmpeg-static. */
export async function findFfmpeg(): Promise<string | null> {
  const system = await onPath('ffmpeg');
  if (system) return system;
  try {
    const bundled = (await import('ffmpeg-static')).default as unknown as string | null;
    if (bundled) {
      await access(bundled, constants.X_OK);
      return bundled;
    }
  } catch {}
  return null;
}

/**
 * Runs ffmpeg with `input` on stdin and returns stdout. Its stderr can echo file names and tags,
 * so it is discarded rather than shown.
 */
function run(ffmpeg: string, args: string[], input?: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args], {
      stdio: [input ? 'pipe' : 'ignore', 'pipe', 'ignore'],
    });
    const out: Buffer[] = [];
    child.stdout!.on('data', (c: Buffer) => out.push(c));
    child.on('error', () => reject(new DomainError('unsupported', 'ffmpeg could not be started')));
    child.on('close', (code) => {
      if (code !== 0) {
        for (const c of out) c.fill(0);
        reject(new DomainError('invalid', 'ffmpeg could not process the audio'));
        return;
      }
      const all = Buffer.concat(out);
      for (const c of out) c.fill(0);
      resolve(new Uint8Array(all.buffer, all.byteOffset, all.byteLength));
    });
    if (input && child.stdin) {
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
  });
}

const pcmBytes = (pcm: Float32Array) => new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);

/**
 * Audio through ffmpeg (spec 8): decode anything to 16 kHz mono float PCM, encode Opus in Ogg,
 * and split into chunks under a byte limit for transcription. Everything stays in memory and in
 * pipes; nothing is written to disk.
 */
export class FfmpegAudioCodec implements AudioCodec {
  constructor(private readonly ffmpeg: string) {}

  static async create(): Promise<FfmpegAudioCodec | null> {
    const path = await findFfmpeg();
    return path ? new FfmpegAudioCodec(path) : null;
  }

  async readBytes(source: AudioSource): Promise<Uint8Array> {
    if (source instanceof Blob) return new Uint8Array(await source.arrayBuffer());
    if ('bytes' in source) return source.bytes;
    return new Uint8Array(await readFile(source.path));
  }

  async decode(source: AudioSource): Promise<DecodedAudio> {
    const output = ['-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', 'pipe:1'];
    const raw =
      !(source instanceof Blob) && 'path' in source
        ? await run(this.ffmpeg, ['-i', source.path, ...output])
        : await run(this.ffmpeg, ['-i', 'pipe:0', ...output], await this.readBytes(source));
    if (raw.byteLength < 4) throw new DomainError('invalid', 'audio has no samples');
    const pcm = new Float32Array(Math.floor(raw.byteLength / 4));
    pcmBytes(pcm).set(raw.subarray(0, pcm.byteLength));
    raw.fill(0);
    return { pcm, sampleRate: SAMPLE_RATE, durationSec: pcm.length / SAMPLE_RATE };
  }

  async encodeOpus(audio: DecodedAudio, opts: { bitrateKbps: number }): Promise<EncodedAudio> {
    const bytes = await run(
      this.ffmpeg,
      [
        ...['-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', 'pipe:0'],
        ...['-c:a', 'libopus', '-b:a', `${opts.bitrateKbps}k`, '-vbr', 'constrained'],
        ...['-application', 'voip'],
        ...['-f', 'ogg', 'pipe:1'],
      ],
      pcmBytes(audio.pcm),
    );
    return { bytes, mimeType: 'audio/ogg' };
  }

  async chunk(
    audio: DecodedAudio,
    opts: { maxBytes: number; bitrateKbps: number },
  ): Promise<Array<EncodedAudio & { startSec: number }>> {
    // Aim under the limit: Ogg pages and VBR overshoot add a few percent.
    const seconds = Math.max(
      1,
      Math.floor(((opts.maxBytes * 8) / (opts.bitrateKbps * 1000)) * 0.85),
    );
    const out: Array<EncodedAudio & { startSec: number }> = [];
    const encodeWindow = async (from: number, to: number): Promise<void> => {
      const window: DecodedAudio = {
        pcm: audio.pcm.subarray(from, to),
        sampleRate: SAMPLE_RATE,
        durationSec: (to - from) / SAMPLE_RATE,
      };
      const encoded = await this.encodeOpus(window, opts);
      if (encoded.bytes.length > opts.maxBytes && to - from > SAMPLE_RATE) {
        encoded.bytes.fill(0);
        const mid = from + Math.floor((to - from) / 2);
        await encodeWindow(from, mid);
        await encodeWindow(mid, to);
        return;
      }
      out.push({ ...encoded, startSec: from / SAMPLE_RATE });
    };
    const step = seconds * SAMPLE_RATE;
    for (let from = 0; from < Math.max(audio.pcm.length, 1); from += step) {
      await encodeWindow(from, Math.min(from + step, audio.pcm.length));
    }
    return out;
  }
}
