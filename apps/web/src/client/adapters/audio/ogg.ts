/**
 * Ogg encapsulation of Opus (RFC 3533, RFC 7845): an incremental writer that knows its exact
 * output size at every step (so chunks can be cut to a byte budget), and a reader that verifies
 * page CRCs. Granule positions count 48 kHz samples, whatever the input rate.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]!) >>> 0;
  return crc;
}

const FLAG_CONTINUED = 0x01;
const FLAG_BOS = 0x02;
const FLAG_EOS = 0x04;
const PAGE_HEADER = 27;
const MAX_SEGMENTS = 255;
/** Flush a page once it holds this much audio (48 kHz samples): one second. */
const PAGE_SAMPLES = 48_000;

export interface OpusHead {
  channels: number;
  /** Samples at 48 kHz to discard at the start (encoder delay). */
  preSkip: number;
  inputSampleRate: number;
  outputGain: number;
}

/** The 19-byte identification header for mono or stereo (channel mapping family 0). */
export function opusHead(h: OpusHead): Uint8Array {
  const b = new Uint8Array(19);
  b.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]); // OpusHead
  const v = new DataView(b.buffer);
  b[8] = 1;
  b[9] = h.channels;
  v.setUint16(10, h.preSkip, true);
  v.setUint32(12, h.inputSampleRate, true);
  v.setInt16(16, h.outputGain, true);
  b[18] = 0;
  return b;
}

export function parseOpusHead(b: Uint8Array): OpusHead | null {
  if (b.length < 19 || new TextDecoder().decode(b.subarray(0, 8)) !== 'OpusHead') return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return {
    channels: b[9]!,
    preSkip: v.getUint16(10, true),
    inputSampleRate: v.getUint32(12, true),
    outputGain: v.getInt16(16, true),
  };
}

function opusTags(vendor: string): Uint8Array {
  const v = new TextEncoder().encode(vendor);
  const b = new Uint8Array(8 + 4 + v.length + 4);
  b.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73]); // OpusTags
  const view = new DataView(b.buffer);
  view.setUint32(8, v.length, true);
  b.set(v, 12);
  view.setUint32(12 + v.length, 0, true);
  return b;
}

const lacingCount = (len: number) => Math.floor(len / 255) + 1;

/**
 * Duration of one Opus packet in 48 kHz samples, from its TOC byte (RFC 6716 section 3.1).
 */
export function opusPacketSamples(packet: Uint8Array): number {
  if (packet.length === 0) return 0;
  const toc = packet[0]!;
  const config = toc >> 3;
  let frame: number;
  if (config < 12) frame = [480, 960, 1920, 2880][config & 3]!;
  else if (config < 16) frame = [480, 960][config & 1]!;
  else frame = [120, 240, 480, 960][config & 3]!;
  const code = toc & 3;
  const count = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 0x3f : 2;
  return frame * count;
}

export interface OggOpusWriterOptions {
  head: OpusHead;
  serial?: number;
  vendor?: string;
}

/**
 * Writes one logical Opus stream. Packets never span pages (Opus packets are at most 1275
 * bytes per frame), so `projectedSize` is exact: the bytes `finish()` would return if one more
 * packet of that length were added.
 */
export class OggOpusWriter {
  readonly head: OpusHead;
  #serial: number;
  #seq = 0;
  #pages: Uint8Array[] = [];
  #written = 0;
  #granule: number;
  #pending: Uint8Array[] = [];
  #pendingLacing = 0;
  #pendingBytes = 0;
  #pendingSamples = 0;
  #packets = 0;

  constructor(opts: OggOpusWriterOptions) {
    this.head = opts.head;
    this.#serial = opts.serial ?? crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0;
    this.#granule = opts.head.preSkip;
    this.#writePage([opusHead(opts.head)], 0, FLAG_BOS);
    this.#writePage([opusTags(opts.vendor ?? 'AskCalls')], 0, 0);
  }

  get packetCount(): number {
    return this.#packets;
  }

  /** Bytes `finish()` returns now. */
  get size(): number {
    return this.#written + (this.#pending.length ? this.#pendingPageSize() : 0);
  }

  /** Bytes `finish()` would return after `add()` of a packet of `len` bytes. */
  projectedSize(len: number): number {
    const n = lacingCount(len);
    if (this.#pending.length && this.#mustFlushBefore(n)) {
      return this.#written + this.#pendingPageSize() + PAGE_HEADER + n + len;
    }
    return this.#written + PAGE_HEADER + this.#pendingLacing + n + this.#pendingBytes + len;
  }

  add(packet: Uint8Array, samples48 = opusPacketSamples(packet)): void {
    const n = lacingCount(packet.length);
    if (n > MAX_SEGMENTS) throw new RangeError('packet too large for one Ogg page');
    if (this.#pending.length && this.#mustFlushBefore(n)) this.#flush(0);
    this.#pending.push(packet);
    this.#pendingLacing += n;
    this.#pendingBytes += packet.length;
    this.#pendingSamples += samples48;
    this.#packets++;
  }

  /**
   * Writes the last page (EOS). `totalSamples48`, when given, trims the end: the final granule
   * says how many decoded samples (after pre-skip) are real audio.
   */
  finish(totalSamples48?: number): Uint8Array {
    let end: number | undefined;
    if (totalSamples48 !== undefined) {
      end = Math.min(this.#granule + this.#pendingSamples, this.head.preSkip + totalSamples48);
    }
    if (this.#pending.length) this.#flush(FLAG_EOS, end);
    else this.#writePage([], end ?? this.#granule, FLAG_EOS);
    const out = new Uint8Array(this.#written);
    let o = 0;
    for (const p of this.#pages) {
      out.set(p, o);
      o += p.length;
    }
    this.#pages = [];
    return out;
  }

  #mustFlushBefore(lacing: number): boolean {
    return this.#pendingLacing + lacing > MAX_SEGMENTS || this.#pendingSamples >= PAGE_SAMPLES;
  }

  #pendingPageSize(): number {
    return PAGE_HEADER + this.#pendingLacing + this.#pendingBytes;
  }

  #flush(flags: number, granuleOverride?: number): void {
    this.#granule += this.#pendingSamples;
    this.#writePage(this.#pending, granuleOverride ?? this.#granule, flags);
    this.#pending = [];
    this.#pendingLacing = 0;
    this.#pendingBytes = 0;
    this.#pendingSamples = 0;
  }

  #writePage(packets: Uint8Array[], granule: number, flags: number): void {
    const lacing: number[] = [];
    let dataLen = 0;
    for (const p of packets) {
      for (let r = p.length; ; r -= 255) {
        lacing.push(Math.min(r, 255));
        if (r < 255) break;
      }
      dataLen += p.length;
    }
    const page = new Uint8Array(PAGE_HEADER + lacing.length + dataLen);
    const v = new DataView(page.buffer);
    page.set([0x4f, 0x67, 0x67, 0x53]); // OggS
    page[4] = 0;
    page[5] = flags;
    v.setBigInt64(6, BigInt(granule), true);
    v.setUint32(14, this.#serial, true);
    v.setUint32(18, this.#seq++, true);
    page[26] = lacing.length;
    page.set(lacing, PAGE_HEADER);
    let o = PAGE_HEADER + lacing.length;
    for (const p of packets) {
      page.set(p, o);
      o += p.length;
    }
    v.setUint32(22, oggCrc(page), true);
    this.#pages.push(page);
    this.#written += page.length;
  }
}

export interface OggPage {
  flags: number;
  granule: bigint;
  serial: number;
  sequence: number;
}

export interface ParsedOggOpus {
  head: OpusHead;
  /** Audio packets, after the two header packets. */
  packets: Uint8Array[];
  pages: OggPage[];
  /** Granule of the last page, in 48 kHz samples (includes pre-skip). */
  finalGranule: bigint;
}

/** Reads one logical Opus stream; throws on a bad capture pattern or CRC. */
export function readOggOpus(bytes: Uint8Array): ParsedOggOpus {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const packets: Uint8Array[] = [];
  const pages: OggPage[] = [];
  let partial: Uint8Array[] = [];
  let o = 0;
  while (o < bytes.length) {
    if (v.getUint32(o) !== 0x4f676753) throw new Error('bad Ogg capture pattern');
    const nseg = bytes[o + 26]!;
    const lacing = bytes.subarray(o + PAGE_HEADER, o + PAGE_HEADER + nseg);
    const dataLen = lacing.reduce((a, b) => a + b, 0);
    const end = o + PAGE_HEADER + nseg + dataLen;
    if (end > bytes.length) throw new Error('truncated Ogg page');
    const page = bytes.slice(o, end);
    const crc = v.getUint32(o + 22, true);
    page.fill(0, 22, 26);
    if (oggCrc(page) !== crc) throw new Error('Ogg CRC mismatch');
    pages.push({
      flags: bytes[o + 5]!,
      granule: v.getBigInt64(o + 6, true),
      serial: v.getUint32(o + 14, true),
      sequence: v.getUint32(o + 18, true),
    });
    let d = o + PAGE_HEADER + nseg;
    let start = d;
    for (const l of lacing) {
      d += l;
      if (l < 255) {
        partial.push(bytes.subarray(start, d));
        const total = partial.reduce((a, p) => a + p.length, 0);
        const packet = new Uint8Array(total);
        let w = 0;
        for (const p of partial) {
          packet.set(p, w);
          w += p.length;
        }
        packets.push(packet);
        partial = [];
        start = d;
      }
    }
    if (start < d) partial.push(bytes.subarray(start, d));
    o = end;
  }
  const head = packets[0] ? parseOpusHead(packets[0]) : null;
  if (!head) throw new Error('missing OpusHead');
  return {
    head,
    packets: packets.slice(2),
    pages,
    finalGranule: pages.at(-1)?.granule ?? 0n,
  };
}

export const OGG_FLAGS = { continued: FLAG_CONTINUED, bos: FLAG_BOS, eos: FLAG_EOS } as const;
