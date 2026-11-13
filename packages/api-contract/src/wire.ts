import { z } from 'zod';

/**
 * Wire encodings. JSON has no bytes or 64-bit integers, so:
 * - bytes travel as standard base64 strings
 * - tokens (signed 64-bit) travel as decimal strings
 * - embeddings travel as number arrays of length 384
 */
export const B64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, 'base64');
export const Tok = z.string().regex(/^-?\d{1,19}$/, 'int64 decimal');
export const Vector384 = z.array(z.number()).length(384);
export const DayInt = z.number().int().min(0).max(200_000);
export const DurationBucketSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export const Cursor = z.string().max(512).nullable().optional();

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const toTok = (t: bigint): string => t.toString(10);
export const fromTok = (s: string): bigint => BigInt.asIntN(64, BigInt(s));

/*
 * Codecs: each decodes the wire form (input) to the domain form (output) on `parse`, and
 * encodes back with `z.encode`. The server parses requests and encodes responses; the client
 * encodes requests and parses responses. One schema, both directions.
 */
const U8 = z.custom<Uint8Array>((v) => v instanceof Uint8Array, 'bytes');
const F32 = z.custom<Float32Array>((v) => v instanceof Float32Array, 'float32 vector');

export const BytesCodec = z.codec(B64, U8, {
  decode: fromB64,
  encode: toB64,
});
export const TokCodec = z.codec(Tok, z.bigint(), { decode: fromTok, encode: toTok });
export const EmbeddingCodec = z.codec(Vector384, F32, {
  decode: (a) => Float32Array.from(a),
  encode: (v) => Array.from(v),
});
export const DateCodec = z.codec(z.iso.datetime({ offset: true }), z.date(), {
  decode: (s) => new Date(s),
  encode: (d) => d.toISOString(),
});

/** Base64 encoded size of `n` bytes, for wire-level size limits. */
export const b64Len = (n: number) => Math.ceil(n / 3) * 4;
export const BytesMax = (maxBytes: number) =>
  z.codec(B64.max(b64Len(maxBytes)), U8, {
    decode: fromB64,
    encode: toB64,
  });

/** Query-string codecs: every query value arrives as a string. */
export const QInt = z.codec(z.string().regex(/^\d{1,9}$/), z.number().int(), {
  decode: (s) => Number.parseInt(s, 10),
  encode: (n) => String(n),
});
export const QDay = z.codec(z.string().regex(/^\d{1,6}$/), DayInt, {
  decode: (s) => Number.parseInt(s, 10),
  encode: (n) => String(n),
});
export const QBool = z.codec(z.enum(['true', 'false', '1', '0']), z.boolean(), {
  decode: (s) => s === 'true' || s === '1',
  encode: (b) => (b ? 'true' : 'false'),
});
/** Comma-separated int64 tokens, e.g. `tag=1,-2` (at most 64). */
export const QTokList = z.codec(
  z.string().regex(/^-?\d{1,19}(,-?\d{1,19}){0,63}$/),
  z.array(z.bigint()),
  {
    decode: (s) => s.split(',').map(fromTok),
    encode: (a) => a.map(toTok).join(','),
  },
);

export const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    /** Content-free message. */
    message: z.string(),
    details: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;
