import { gcmOpen, gcmSeal, TAG_LENGTH } from './aead';
import { concat, randomBytes, readU32be, u32be } from './bytes';
import { CryptoError } from './errors';

/**
 * Segmented AES-256-GCM for recordings (spec 6.3).
 *
 * ```
 * header   = version(0x01) ‖ u32be(segmentSize) ‖ noncePrefix(8)                 13 bytes
 * segment_i = AES-GCM(DEK, nonce_i, plaintext_i, aad_i)  = ct_i ‖ tag(16)
 * nonce_i  = noncePrefix ‖ u32be(i)
 * aad_i    = header ‖ baseAad ‖ u32be(i) ‖ u8(final ? 1 : 0)
 * blob     = header ‖ segment_0 ‖ … ‖ segment_{n-1}
 * ```
 *
 * Every segment but the last holds exactly `segmentSize` plaintext bytes; the last holds
 * 0..segmentSize bytes and is the only one with `final = 1`. An empty recording is one empty final
 * segment. So `n = max(1, ceil(len / segmentSize))` and the ciphertext size is known up front:
 * `13 + len + 16 n` (`encryptedRecordingSize`), which the presigned PUT needs.
 *
 * Detection: reordering changes `i` in the nonce and AAD; truncation at a segment boundary leaves
 * a last segment whose tag was computed with `final = 0`; appended bytes or segments make the real
 * final segment decrypt with `final = 0`. Each fails authentication. Decryption streams, so a
 * consumer sees plaintext of earlier segments before a later failure: treat the output as
 * unverified until the iterator finishes without throwing.
 *
 * `baseAad` should be `aad({ userId, callId, field: AadFields.recording })`.
 */
export const RECORDING_VERSION = 0x01;
export const RECORDING_HEADER_LENGTH = 13;
export const RECORDING_NONCE_PREFIX_LENGTH = 8;
export const DEFAULT_SEGMENT_SIZE = 1024 * 1024;
/** Upper bound on the segment size accepted from a header (bounds decryption memory). */
export const MAX_SEGMENT_SIZE = 16 * 1024 * 1024;
const MAX_SEGMENTS = 0x1_0000_0000;

export type ByteSource =
  | AsyncIterable<Uint8Array>
  | Iterable<Uint8Array>
  | ReadableStream<Uint8Array>;

function checkSegmentSize(size: number): number {
  if (!Number.isInteger(size) || size < 1 || size > MAX_SEGMENT_SIZE) {
    throw new CryptoError('invalid_input', 'segment size out of range');
  }
  return size;
}

function segmentCount(plaintextLength: number, segmentSize: number): number {
  return Math.max(1, Math.ceil(plaintextLength / segmentSize));
}

/** Exact ciphertext size for a plaintext of `plaintextLength` bytes. */
export function encryptedRecordingSize(
  plaintextLength: number,
  segmentSize = DEFAULT_SEGMENT_SIZE,
): number {
  checkSegmentSize(segmentSize);
  if (!Number.isSafeInteger(plaintextLength) || plaintextLength < 0) {
    throw new CryptoError('invalid_input', 'length out of range');
  }
  return (
    RECORDING_HEADER_LENGTH +
    plaintextLength +
    TAG_LENGTH * segmentCount(plaintextLength, segmentSize)
  );
}

/** Plaintext size of a well-formed blob of `ciphertextLength` bytes (for progress and ranges). */
export function recordingPlaintextSize(
  ciphertextLength: number,
  segmentSize = DEFAULT_SEGMENT_SIZE,
): number {
  checkSegmentSize(segmentSize);
  const body = ciphertextLength - RECORDING_HEADER_LENGTH;
  const record = segmentSize + TAG_LENGTH;
  if (body < TAG_LENGTH) throw new CryptoError('invalid_format', 'recording too short');
  const full = Math.floor((body - 1) / record);
  const last = body - full * record;
  if (last < TAG_LENGTH) throw new CryptoError('invalid_format', 'recording size invalid');
  return full * segmentSize + last - TAG_LENGTH;
}

async function* iterate(source: ByteSource): AsyncGenerator<Uint8Array> {
  if (typeof (source as ReadableStream<Uint8Array>).getReader === 'function') {
    const reader = (source as ReadableStream<Uint8Array>).getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    yield* source as AsyncIterable<Uint8Array> | Iterable<Uint8Array>;
  }
}

/** FIFO of byte chunks with exact-size takes. */
class ByteQueue {
  #chunks: Uint8Array[] = [];
  #offset = 0;
  length = 0;

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    this.#chunks.push(chunk);
    this.length += chunk.length;
  }

  take(n: number): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(n);
    let filled = 0;
    while (filled < n) {
      const head = this.#chunks[0]!;
      const available = head.length - this.#offset;
      const count = Math.min(available, n - filled);
      out.set(head.subarray(this.#offset, this.#offset + count), filled);
      filled += count;
      this.#offset += count;
      if (this.#offset === head.length) {
        this.#chunks.shift();
        this.#offset = 0;
      }
    }
    this.length -= n;
    return out;
  }
}

const nonceFor = (prefix: Uint8Array, i: number) => concat(prefix, u32be(i));
const aadFor = (header: Uint8Array, baseAad: Uint8Array, i: number, final: boolean) =>
  concat(header, baseAad, u32be(i), Uint8Array.of(final ? 1 : 0));

export interface RecordingOptions {
  /** Plaintext bytes per segment. Default 1 MiB. */
  segmentSize?: number;
  /** Test vectors only: fixed nonce prefix. Production must let it be random. */
  noncePrefix?: Uint8Array;
}

/** Encrypt a byte stream. Yields the header, then one chunk per segment. */
export async function* encryptRecordingStream(
  dek: CryptoKey,
  source: ByteSource,
  baseAad: Uint8Array,
  options: RecordingOptions = {},
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const segmentSize = checkSegmentSize(options.segmentSize ?? DEFAULT_SEGMENT_SIZE);
  const prefix = options.noncePrefix ?? randomBytes(RECORDING_NONCE_PREFIX_LENGTH);
  if (prefix.length !== RECORDING_NONCE_PREFIX_LENGTH) {
    throw new CryptoError('invalid_input', 'nonce prefix must be 8 bytes');
  }
  const header = concat(Uint8Array.of(RECORDING_VERSION), u32be(segmentSize), prefix);
  yield header;

  const queue = new ByteQueue();
  let i = 0;
  const seal = (plaintext: Uint8Array, final: boolean) => {
    if (i >= MAX_SEGMENTS) throw new CryptoError('invalid_input', 'recording too long');
    return gcmSeal(dek, nonceFor(prefix, i), plaintext, aadFor(header, baseAad, i, final));
  };
  for await (const chunk of iterate(source)) {
    queue.push(chunk);
    // Keep at least one byte back so the last segment is known to be final.
    while (queue.length > segmentSize) {
      yield await seal(queue.take(segmentSize), false);
      i++;
    }
  }
  yield await seal(queue.take(queue.length), true);
}

/** Decrypt a byte stream produced by `encryptRecordingStream`. Yields plaintext per segment. */
export async function* decryptRecordingStream(
  dek: CryptoKey,
  source: ByteSource,
  baseAad: Uint8Array,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const queue = new ByteQueue();
  let header: Uint8Array | null = null;
  let prefix: Uint8Array = new Uint8Array(0);
  let record = 0;
  let i = 0;
  const open = (sealed: Uint8Array, final: boolean) =>
    gcmOpen(dek, nonceFor(prefix, i), sealed, aadFor(header!, baseAad, i, final));

  for await (const chunk of iterate(source)) {
    queue.push(chunk);
    if (!header && queue.length >= RECORDING_HEADER_LENGTH) {
      header = queue.take(RECORDING_HEADER_LENGTH);
      if (header[0] !== RECORDING_VERSION)
        throw new CryptoError('invalid_format', 'unknown version');
      const segmentSize = readU32be(header, 1);
      if (segmentSize < 1 || segmentSize > MAX_SEGMENT_SIZE) {
        throw new CryptoError('invalid_format', 'segment size out of range');
      }
      record = segmentSize + TAG_LENGTH;
      prefix = header.subarray(5, 5 + RECORDING_NONCE_PREFIX_LENGTH);
    }
    if (!header) continue;
    while (queue.length > record) {
      yield await open(queue.take(record), false);
      i++;
      if (i >= MAX_SEGMENTS) throw new CryptoError('invalid_format', 'recording too long');
    }
  }
  if (!header) throw new CryptoError('truncated', 'recording header missing');
  if (queue.length < TAG_LENGTH) throw new CryptoError('truncated', 'final segment missing');
  yield await open(queue.take(queue.length), true);
}

async function collect(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const parts: Uint8Array[] = [];
  for await (const c of chunks) parts.push(c);
  return concat(...parts);
}

/** Encrypt a whole buffer (e.g. an encoded Opus file) into the segmented format. */
export const encryptRecording = (
  dek: CryptoKey,
  plaintext: Uint8Array,
  baseAad: Uint8Array,
  options: RecordingOptions = {},
) => collect(encryptRecordingStream(dek, [plaintext], baseAad, options));

/** Decrypt a whole segmented blob. */
export const decryptRecording = (dek: CryptoKey, ciphertext: Uint8Array, baseAad: Uint8Array) =>
  collect(decryptRecordingStream(dek, [ciphertext], baseAad));

/** Wrap an async iterable of bytes as a ReadableStream (e.g. for `fetch` upload bodies). */
export function toReadableStream(chunks: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> {
  const it = chunks[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await it.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (e) {
        controller.error(e);
      }
    },
    async cancel() {
      await it.return?.();
    },
  });
}
