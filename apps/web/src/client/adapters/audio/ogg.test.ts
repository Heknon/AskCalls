import { describe, expect, it } from 'vitest';
import { type OpusPacket, spanEnergy, splitIntoChunks, writeOgg } from './chunking';
import { OGG_FLAGS, OggOpusWriter, oggCrc, opusPacketSamples, readOggOpus } from './ogg';

const head = { channels: 1, preSkip: 312, inputSampleRate: 16_000, outputGain: 0 };

/** A CELT 20 ms mono packet (TOC config 31, code 0) of `len` bytes, filled with `fill`. */
function packet(len: number, fill = 7): Uint8Array {
  const p = new Uint8Array(len).fill(fill);
  p[0] = (31 << 3) | 0;
  return p;
}

const packets = (n: number, len: (i: number) => number): OpusPacket[] =>
  Array.from({ length: n }, (_, i) => ({
    data: packet(len(i), i & 0xff),
    samples48: 960,
    startSec: i * 0.02,
  }));

describe('Ogg Opus writer', () => {
  it('uses the Ogg CRC (poly 0x04c11db7, no reflection)', () => {
    expect(oggCrc(new TextEncoder().encode('123456789'))).toBe(0x89a1897f);
  });

  it('reads TOC durations', () => {
    expect(opusPacketSamples(packet(10))).toBe(960);
    expect(opusPacketSamples(Uint8Array.of((1 << 3) | 0))).toBe(960); // SILK NB 20 ms
    expect(opusPacketSamples(Uint8Array.of((3 << 3) | 1))).toBe(2 * 2880); // 2 x 60 ms
    expect(opusPacketSamples(Uint8Array.of((16 << 3) | 3, 5))).toBe(5 * 120); // 5 x 2.5 ms
  });

  it('round-trips headers, packets and granules, and size is exact at every step', () => {
    const w = new OggOpusWriter({ head, serial: 42 });
    const input = packets(300, (i) => 40 + ((i * 37) % 300));
    for (const p of input) {
      const projected = w.projectedSize(p.data.length);
      w.add(p.data, p.samples48);
      expect(w.size).toBe(projected);
    }
    const expectedSize = w.size;
    const bytes = w.finish(300 * 960 - 100);
    expect(bytes.length).toBe(expectedSize);

    const parsed = readOggOpus(bytes);
    expect(parsed.head).toEqual(head);
    expect(parsed.packets.map((p) => [...p])).toEqual(input.map((p) => [...p.data]));
    expect(parsed.pages[0]!.flags).toBe(OGG_FLAGS.bos);
    expect(parsed.pages.at(-1)!.flags & OGG_FLAGS.eos).toBe(OGG_FLAGS.eos);
    expect(parsed.pages.every((p) => p.serial === 42)).toBe(true);
    expect(parsed.pages.map((p) => p.sequence)).toEqual(parsed.pages.map((_, i) => i));
    expect(parsed.finalGranule).toBe(BigInt(312 + 300 * 960 - 100));
    const granules = parsed.pages.slice(2).map((p) => p.granule);
    expect([...granules].sort((a, b) => (a < b ? -1 : 1))).toEqual(granules);
    // One second of audio per page at most.
    expect(parsed.pages.length).toBeGreaterThanOrEqual(2 + Math.ceil((300 * 960) / 48_000));
  });

  it('splits packets of 255-byte multiples with zero-length lacing values', () => {
    const input = [packet(255), packet(510), packet(1), packet(254)];
    const w = new OggOpusWriter({ head });
    for (const p of input) w.add(p);
    expect(readOggOpus(w.finish()).packets.map((p) => p.length)).toEqual([255, 510, 1, 254]);
  });

  it('detects corruption', () => {
    const bytes = writeOgg(
      head,
      packets(10, () => 50),
    );
    bytes[bytes.length - 3]! ^= 1;
    expect(() => readOggOpus(bytes)).toThrow(/CRC/);
  });
});

describe('chunking', () => {
  it('keeps every chunk under maxBytes, covers every packet once and keeps start times', () => {
    const input = packets(3_000, (i) => 50 + (i % 40));
    const total = 3_000 * 960;
    const chunks = splitIntoChunks(head, input, { maxBytes: 20_000, totalSamples48: total });
    expect(chunks.length).toBeGreaterThan(5);
    let next = 0;
    for (const c of chunks) {
      expect(c.bytes.length).toBeLessThanOrEqual(20_000);
      const parsed = readOggOpus(c.bytes);
      expect(c.startSec).toBeCloseTo(next * 0.02, 9);
      expect([...parsed.packets[0]!]).toEqual([...input[next]!.data]);
      next += parsed.packets.length;
    }
    expect(next).toBe(3_000);
    expect(chunks.reduce((s, c) => s + c.durationSec, 0)).toBeCloseTo(total / 48_000, 6);
  });

  it('cuts at the quietest packet once a chunk is 85% full', () => {
    const input = packets(1_000, () => 60);
    const quiet = new Set([400, 455, 700]);
    const chunks = splitIntoChunks(head, input, {
      maxBytes: 32_000,
      energy: (i) => (quiet.has(i) ? 0 : 1),
    });
    // 32 kB holds ~470 packets: the window spans ~400..470, and 455 is the last quiet one.
    expect(chunks[0]!.startSec).toBe(0);
    expect(chunks[1]!.startSec).toBeCloseTo(455 * 0.02, 9);
    expect(chunks[0]!.bytes.length).toBeLessThanOrEqual(32_000);
  });

  it('trims the last chunk to the real duration', () => {
    const input = packets(100, () => 30);
    const [only] = splitIntoChunks(head, input, { maxBytes: 1e6, totalSamples48: 99 * 960 + 10 });
    expect(readOggOpus(only!.bytes).finalGranule).toBe(BigInt(312 + 99 * 960 + 10));
    expect(only!.durationSec).toBeCloseTo((99 * 960 + 10) / 48_000, 9);
  });

  it('rejects a budget smaller than one packet', () => {
    expect(() =>
      splitIntoChunks(
        head,
        packets(3, () => 500),
        { maxBytes: 200 },
      ),
    ).toThrow();
  });

  it('scores energy over a time span', () => {
    const pcm = new Float32Array(16_000).fill(0.5);
    pcm.fill(0, 8_000);
    expect(spanEnergy(pcm, 16_000, 0, 0.1)).toBeCloseTo(0.25);
    expect(spanEnergy(pcm, 16_000, 0.6, 0.1)).toBe(0);
  });
});
