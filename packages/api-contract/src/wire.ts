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
