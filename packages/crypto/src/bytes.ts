import { CryptoError } from './errors';

/** Narrow a Uint8Array to one backed by a plain ArrayBuffer, as WebCrypto's types require. */
export function buf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer
    ? (bytes as Uint8Array<ArrayBuffer>)
    : new Uint8Array(bytes);
}

export const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  // getRandomValues fills at most 65536 bytes per call.
  for (let i = 0; i < length; i += 65536) {
    globalThis.crypto.getRandomValues(out.subarray(i, Math.min(length, i + 65536)));
  }
  return out;
}

/** Uniform random integer in [0, max) without modulo bias. */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max < 1 || max > 0x1_0000_0000) {
    throw new CryptoError('invalid_input', 'randomInt bound out of range');
  }
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % max);
  const word = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(word);
    if (word[0]! < limit) return word[0]! % max;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export const utf8 = (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text);

export function fromUtf8(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new CryptoError('invalid_format', 'invalid utf-8');
  }
}

export function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let length = 0;
  for (const p of parts) length += p.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function u32be(n: number): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff_ffff) {
    throw new CryptoError('invalid_input', 'uint32 out of range');
  }
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, false);
  return out;
}

export function readU32be(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

export function i64be(n: bigint): Uint8Array<ArrayBuffer> {
  if (n < -(1n << 63n) || n >= 1n << 63n) {
    throw new CryptoError('invalid_input', 'int64 out of range');
  }
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, n, false);
  return out;
}

/** `u32be(len(bytes)) ‖ bytes`: the length prefix used by every multi-field encoding here. */
export const lengthPrefixed = (bytes: Uint8Array): Uint8Array<ArrayBuffer> =>
  concat(u32be(bytes.length), bytes);

/** Constant-time comparison for equal-length inputs. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Overwrite a buffer with zeros. */
export function wipeBytes(bytes: Uint8Array): void {
  bytes.fill(0);
}

export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new CryptoError('invalid_format', 'invalid hex');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Unpadded base64url (RFC 4648 section 5), used for byte values inside `kdfParams` JSON. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64URL[n >> 18]! + B64URL[(n >> 12) & 63]! + B64URL[(n >> 6) & 63]! + B64URL[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += B64URL[n >> 18]! + B64URL[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64URL[n >> 18]! + B64URL[(n >> 12) & 63]! + B64URL[(n >> 6) & 63]!;
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
    throw new CryptoError('invalid_format', 'invalid base64url');
  }
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let o = 0;
  for (const ch of text) {
    acc = ((acc << 6) | B64URL.indexOf(ch)) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  if ((acc & ((1 << bits) - 1)) !== 0) throw new CryptoError('invalid_format', 'invalid base64url');
  return out;
}
