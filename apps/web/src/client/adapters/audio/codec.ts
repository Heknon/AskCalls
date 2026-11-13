import type {
  AudioCodec,
  AudioSource,
  DecodedAudio,
  EncodedAudio,
} from '@askcalls/client-core/ports/index';
import { DomainError } from '@askcalls/domain';
import { type OpusPacket, spanEnergy, splitIntoChunks, writeOgg } from './chunking';
import { FfmpegClient } from './ffmpeg';
import { type OpusHead, opusPacketSamples, parseOpusHead, readOggOpus } from './ogg';

export const SAMPLE_RATE = 16_000;
export const OGG_OPUS_MIME = 'audio/ogg; codecs=opus';
/** libopus lookahead at 48 kHz, used when the encoder does not report its pre-skip. */
const DEFAULT_PRE_SKIP = 312;
/** AudioData frames handed to the encoder per call: one second. */
const FEED_FRAMES = SAMPLE_RATE;

export interface EncodedPackets {
  head: OpusHead;
  packets: OpusPacket[];
  totalSamples48: number;
}

export type DecodePath = 'webaudio' | 'ffmpeg';

/**
 * Browser AudioCodec (spec 3.3): the browser's own decoder first (WebAudio decodeAudioData,
 * resampled to 16 kHz by an OfflineAudioContext), then ffmpeg.wasm for formats it rejects
 * (AMR, some M4A, anything the build lacks). Opus is encoded with WebCodecs AudioEncoder and
 * muxed into Ogg here; without AudioEncoder, ffmpeg's libopus encodes instead.
 */
export class BrowserAudioCodec implements AudioCodec {
  #ffmpeg: FfmpegClient | null = null;
  /** How the last `decode()` succeeded; for diagnostics and tests. */
  lastDecodePath: DecodePath | null = null;

  constructor(private readonly opts: { ffmpeg?: () => FfmpegClient; forceFfmpeg?: boolean } = {}) {}

  async readBytes(source: AudioSource): Promise<Uint8Array> {
    if (source instanceof Blob) return new Uint8Array(await source.arrayBuffer());
    if ('bytes' in source) return source.bytes;
    throw new DomainError('unsupported', 'file paths are not readable in the browser');
  }

  async decode(source: AudioSource): Promise<DecodedAudio> {
    const bytes = await this.readBytes(source);
    let pcm: Float32Array | null = null;
    if (!this.opts.forceFfmpeg) {
      pcm = await decodeWithWebAudio(bytes).catch(() => null);
      if (pcm) this.lastDecodePath = 'webaudio';
    }
    if (!pcm) {
      try {
        pcm = await this.#ff().decodeToPcm16k(bytes);
      } catch (e) {
        if ((e as DomainError)?.code === 'unsupported') throw e;
        throw new DomainError('invalid', 'audio could not be decoded');
      }
      if (pcm.length === 0) throw new DomainError('invalid', 'audio could not be decoded');
      this.lastDecodePath = 'ffmpeg';
    }
    return { pcm, sampleRate: SAMPLE_RATE, durationSec: pcm.length / SAMPLE_RATE };
  }

  async encodeOpus(audio: DecodedAudio, opts: { bitrateKbps: number }): Promise<EncodedAudio> {
    const enc = await this.encodePackets(audio, opts.bitrateKbps);
    return {
      bytes: writeOgg(enc.head, enc.packets, 0, enc.packets.length, enc.totalSamples48),
      mimeType: OGG_OPUS_MIME,
    };
  }

  async chunk(
    audio: DecodedAudio,
    opts: { maxBytes: number; bitrateKbps: number },
  ): Promise<Array<EncodedAudio & { startSec: number }>> {
    const enc = await this.encodePackets(audio, opts.bitrateKbps);
    return splitIntoChunks(enc.head, enc.packets, {
      maxBytes: opts.maxBytes,
      totalSamples48: enc.totalSamples48,
      energy: (i) => {
        const p = enc.packets[i]!;
        return spanEnergy(audio.pcm, SAMPLE_RATE, p.startSec, p.samples48 / 48_000);
      },
    }).map((c) => ({ bytes: c.bytes, mimeType: OGG_OPUS_MIME, startSec: c.startSec }));
  }

  /** Opus packets for the whole recording, with timing; the input to muxing and chunking. */
  async encodePackets(audio: DecodedAudio, bitrateKbps: number): Promise<EncodedPackets> {
    if (audio.sampleRate !== SAMPLE_RATE) throw new DomainError('invalid', 'expected 16 kHz PCM');
    const totalSamples48 = Math.round((audio.pcm.length * 48_000) / SAMPLE_RATE);
    if (!this.opts.forceFfmpeg && (await webCodecsOpusSupported(bitrateKbps))) {
      return { ...(await encodeWithWebCodecs(audio.pcm, bitrateKbps)), totalSamples48 };
    }
    const parsed = readOggOpus(await this.#ff().encodeOpus(audio.pcm, bitrateKbps));
    let t = 0;
    const packets = parsed.packets.map((data) => {
      const samples48 = opusPacketSamples(data);
      const p = { data, samples48, startSec: t / 48_000 };
      t += samples48;
      return p;
    });
    return { head: parsed.head, packets, totalSamples48 };
  }

  /** Stops the ffmpeg worker, if one was started. */
  dispose(): void {
    this.#ffmpeg?.terminate();
    this.#ffmpeg = null;
  }

  #ff(): FfmpegClient {
    this.#ffmpeg ??= this.opts.ffmpeg?.() ?? new FfmpegClient();
    return this.#ffmpeg;
  }
}

/** decodeAudioData into a 16 kHz context resamples; channels are averaged to mono. */
async function decodeWithWebAudio(bytes: Uint8Array): Promise<Float32Array> {
  if (typeof OfflineAudioContext === 'undefined') throw new Error('no WebAudio');
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: SAMPLE_RATE });
  const buffer = await ctx.decodeAudioData(bytes.slice().buffer);
  if (buffer.length === 0) throw new Error('empty');
  const out = new Float32Array(buffer.length);
  const n = buffer.numberOfChannels;
  for (let c = 0; c < n; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i]! += ch[i]! / n;
  }
  return out;
}

function encoderConfig(bitrateKbps: number): AudioEncoderConfig {
  return {
    codec: 'opus',
    sampleRate: SAMPLE_RATE,
    numberOfChannels: 1,
    bitrate: bitrateKbps * 1000,
    opus: { frameDuration: 20_000, application: 'voip', signal: 'voice' },
  } as AudioEncoderConfig;
}

async function webCodecsOpusSupported(bitrateKbps: number): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return false;
  try {
    return (await AudioEncoder.isConfigSupported(encoderConfig(bitrateKbps))).supported === true;
  } catch {
    return false;
  }
}

async function encodeWithWebCodecs(
  pcm: Float32Array,
  bitrateKbps: number,
): Promise<{ head: OpusHead; packets: OpusPacket[] }> {
  const packets: OpusPacket[] = [];
  let preSkip = DEFAULT_PRE_SKIP;
  let failure: unknown = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const description = meta?.decoderConfig?.description;
      if (description) {
        const view = ArrayBuffer.isView(description)
          ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
          : new Uint8Array(description);
        const head = parseOpusHead(view);
        if (head) preSkip = head.preSkip;
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      packets.push({
        data,
        samples48: opusPacketSamples(data),
        startSec: chunk.timestamp / 1e6,
      });
    },
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure(encoderConfig(bitrateKbps));
  for (let o = 0; o < pcm.length; o += FEED_FRAMES) {
    const frames = pcm.subarray(o, Math.min(pcm.length, o + FEED_FRAMES));
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: SAMPLE_RATE,
      numberOfFrames: frames.length,
      numberOfChannels: 1,
      timestamp: Math.round((o * 1e6) / SAMPLE_RATE),
      data: frames.slice(),
    });
    encoder.encode(data);
    data.close();
    // Keep the encoder queue short so a long recording does not sit in memory twice.
    if (encoder.encodeQueueSize > 8) {
      await new Promise<void>((resolve) =>
        encoder.addEventListener('dequeue', () => resolve(), { once: true }),
      );
    }
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw new DomainError('invalid', 'audio could not be encoded');
  packets.sort((a, b) => a.startSec - b.startSec);
  return {
    head: { channels: 1, preSkip, inputSampleRate: SAMPLE_RATE, outputGain: 0 },
    packets,
  };
}
