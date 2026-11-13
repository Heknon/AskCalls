import { OggOpusWriter, type OpusHead } from './ogg';

/** One encoded Opus packet and where it sits in the source audio. */
export interface OpusPacket {
  data: Uint8Array;
  /** 48 kHz samples this packet decodes to. */
  samples48: number;
  startSec: number;
}

export interface OggChunk {
  bytes: Uint8Array;
  startSec: number;
  durationSec: number;
}

/** Start looking for a quiet cut once a chunk is this full. */
const QUIET_WINDOW_FROM = 0.85;

/** Writes packets [from, to) as one Ogg Opus file. `endSamples48` trims the last packet. */
export function writeOgg(
  head: OpusHead,
  packets: readonly OpusPacket[],
  from = 0,
  to = packets.length,
  endSamples48?: number,
): Uint8Array {
  const w = new OggOpusWriter({ head });
  for (let i = from; i < to; i++) w.add(packets[i]!.data, packets[i]!.samples48);
  return w.finish(endSamples48);
}

/**
 * Splits a packet stream into Ogg files of at most `maxBytes` each. Once a chunk is 85% full,
 * the cut goes before the quietest packet still fitting (lowest `energy`), so words are rarely
 * split between two transcription requests. Every chunk carries its own headers and the same
 * pre-skip, so its decoded audio starts at the first packet's `startSec`.
 */
export function splitIntoChunks(
  head: OpusHead,
  packets: readonly OpusPacket[],
  opts: { maxBytes: number; totalSamples48?: number; energy?: (index: number) => number },
): OggChunk[] {
  const chunks: OggChunk[] = [];
  let start = 0;
  while (start < packets.length) {
    const w = new OggOpusWriter({ head });
    let quietest = -1;
    let quietestEnergy = Number.POSITIVE_INFINITY;
    let j = start;
    while (j < packets.length && w.projectedSize(packets[j]!.data.length) <= opts.maxBytes) {
      if (j > start && opts.energy && w.size >= QUIET_WINDOW_FROM * opts.maxBytes) {
        const e = opts.energy(j);
        if (e <= quietestEnergy) {
          quietestEnergy = e;
          quietest = j;
        }
      }
      w.add(packets[j]!.data, packets[j]!.samples48);
      j++;
    }
    if (j === start) throw new RangeError('maxBytes is smaller than one Opus packet');
    const last = j === packets.length;
    const end = last || quietest < 0 ? j : quietest;
    const samples = packets.slice(start, end).reduce((n, p) => n + p.samples48, 0);
    const trimmed =
      last && opts.totalSamples48 !== undefined
        ? Math.max(0, opts.totalSamples48 - Math.round(packets[start]!.startSec * 48_000))
        : undefined;
    const bytes = end === j ? w.finish(trimmed) : writeOgg(head, packets, start, end);
    chunks.push({
      bytes,
      startSec: packets[start]!.startSec,
      durationSec: Math.min(samples, trimmed ?? samples) / 48_000,
    });
    start = end;
  }
  return chunks;
}

/** Mean square of `pcm` over a time span: the cut-point score. */
export function spanEnergy(
  pcm: Float32Array,
  sampleRate: number,
  startSec: number,
  durSec: number,
) {
  const a = Math.max(0, Math.floor(startSec * sampleRate));
  const b = Math.min(pcm.length, Math.ceil((startSec + durSec) * sampleRate));
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i++) s += pcm[i]! * pcm[i]!;
  return s / (b - a);
}
