import { buf, concat, subtle, utf8 } from './bytes';
import { CryptoError } from './errors';
import { sha256Text } from './hash';

/**
 * Blind-index token kinds (spec 6.4):
 * - `w` keyword (normalized string)
 * - `c` contact (E.164 string)
 * - `t` tag id (random id string from the encrypted catalog, never the name)
 * - `a` audio fingerprint (32 SHA-256 bytes of decoded 16 kHz mono PCM, or of the file)
 * - `x` content (32 SHA-256 bytes of the normalized transcript text)
 */
export type TokenKind = 'w' | 'c' | 't' | 'a' | 'x';
export const TOKEN_KINDS: readonly TokenKind[] = ['w', 'c', 't', 'a', 'x'];

/** A string value is hashed as its UTF-8 bytes; a Uint8Array as itself. */
export type TokenValue = string | Uint8Array;

function message(kind: TokenKind, value: TokenValue): Uint8Array<ArrayBuffer> {
  if (!TOKEN_KINDS.includes(kind)) throw new CryptoError('invalid_input', 'unknown token kind');
  return concat(utf8(kind), Uint8Array.of(0), typeof value === 'string' ? utf8(value) : value);
}

/**
 * `token(kind, value)` = first 8 bytes of `HMAC-SHA256(indexKey, kind ‖ 0x00 ‖ value)`, read
 * big-endian as a signed 64-bit integer (Postgres `bigint`). Values can be negative.
 */
export async function token(
  indexKey: CryptoKey,
  kind: TokenKind,
  value: TokenValue,
): Promise<bigint> {
  const mac = await subtle().sign('HMAC', indexKey, buf(message(kind, value)));
  return new DataView(mac).getBigInt64(0, false);
}

/** Tokens for many values of one kind, in input order (duplicates give duplicate tokens). */
export const tokens = (
  indexKey: CryptoKey,
  kind: TokenKind,
  values: readonly TokenValue[],
): Promise<bigint[]> => Promise.all(values.map((v) => token(indexKey, kind, v)));

/** Distinct tokens for a set of values, sorted ascending: the form stored in `keywordToks`/`tagToks`. */
export async function tokenSet(
  indexKey: CryptoKey,
  kind: TokenKind,
  values: Iterable<TokenValue>,
): Promise<bigint[]> {
  const unique = new Map<string, TokenValue>();
  for (const v of values) unique.set(typeof v === 'string' ? `s${v}` : `b${[...v].join(',')}`, v);
  const out = [...new Set(await tokens(indexKey, kind, [...unique.values()]))];
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** `contentTok = token('x', sha256(utf8(normalizedText)))`. Normalize with packages/indexing first. */
export async function contentToken(indexKey: CryptoKey, normalizedText: string): Promise<bigint> {
  return token(indexKey, 'x', await sha256Text(normalizedText));
}
