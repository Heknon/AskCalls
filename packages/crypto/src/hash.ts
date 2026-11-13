import { buf, subtle, utf8 } from './bytes';

/** SHA-256 of raw bytes. */
export async function sha256(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle().digest('SHA-256', buf(bytes)));
}

/**
 * SHA-256 of the UTF-8 encoding of `text`. The caller normalizes first
 * (packages/indexing owns transcript normalization); this function does not touch the string.
 */
export const sha256Text = (text: string): Promise<Uint8Array<ArrayBuffer>> => sha256(utf8(text));

/**
 * HKDF-SHA256 (RFC 5869) returning raw bytes. `salt` defaults to empty, which HKDF treats as
 * 32 zero bytes.
 */
export async function hkdfBytes(
  ikm: Uint8Array,
  info: string | Uint8Array,
  length = 32,
  salt: Uint8Array = new Uint8Array(0),
): Promise<Uint8Array<ArrayBuffer>> {
  const base = await subtle().importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: buf(salt),
      info: typeof info === 'string' ? utf8(info) : buf(info),
    },
    base,
    length * 8,
  );
  return new Uint8Array(bits);
}
