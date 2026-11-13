import { DomainError, EMBEDDING_DIMENSIONS } from '@askcalls/domain';

/**
 * Value conversions shared by both drivers. node-postgres returns bytea as Buffer, int8 as
 * string and timestamps as Date; PGlite returns Uint8Array, number | bigint and strings (Drizzle
 * turns its timestamp parsers off). Raw SQL results go through these to get one shape.
 */

/** A fresh, non-Buffer Uint8Array that owns its bytes. */
export function toBytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return new Uint8Array(v);
  if (typeof v === 'string' && v.startsWith('\\x')) {
    const hex = v.slice(2);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  throw new TypeError('expected bytea');
}

export const toBytesOrNull = (v: unknown): Uint8Array | null => (v == null ? null : toBytes(v));

/** node-postgres only serializes Buffer as bytea; PGlite accepts any Uint8Array. */
export function toDriverBytes(v: Uint8Array): Uint8Array {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function toBigInt(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' || typeof v === 'string') return BigInt(v);
  throw new TypeError('expected int8');
}

export const toBigIntOrNull = (v: unknown): bigint | null => (v == null ? null : toBigInt(v));

/** int8[] from a raw row: an array of numbers/bigints/strings, or a `{1,2}` literal. */
export function toBigIntArray(v: unknown): bigint[] {
  if (Array.isArray(v)) return v.map(toBigInt);
  if (typeof v === 'string') {
    const inner = v.replace(/^\{|\}$/g, '');
    return inner ? inner.split(',').map((x) => BigInt(x)) : [];
  }
  throw new TypeError('expected int8[]');
}

export function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    // Postgres text form `2026-01-01 10:00:00.123+00` → ISO 8601.
    let s = v.trim().replace(' ', 'T');
    s = s.replace(/([+-]\d\d)$/, '$1:00').replace(/([+-]\d\d)(\d\d)$/, '$1:$2');
    if (!/(?:[zZ]|[+-]\d\d:\d\d)$/.test(s)) s += 'Z';
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new TypeError('expected timestamp');
}

export function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint' || typeof v === 'string') return Number(v);
  throw new TypeError('expected number');
}

/** Tokens as a single int8[] parameter. Strings keep full 64-bit precision on both drivers. */
export const tokParam = (toks: readonly bigint[]): string[] => toks.map((t) => t.toString());

/** pgvector text form. Validates the dimension so a bad vector fails as `invalid`, not a 500. */
export function vectorLiteral(v: Float32Array): string {
  if (v.length !== EMBEDDING_DIMENSIONS) {
    throw new DomainError('invalid', 'embedding has the wrong dimension', {
      expected: EMBEDDING_DIMENSIONS,
      got: v.length,
    });
  }
  let out = '[';
  for (let i = 0; i < v.length; i++) {
    const x = v[i]!;
    if (!Number.isFinite(x)) throw new DomainError('invalid', 'embedding is not finite');
    out += i ? `,${x}` : `${x}`;
  }
  return `${out}]`;
}

/** Opaque keyset cursor: `<mode>.<base64url(JSON)>`. */
export function encodeCursor(mode: string, values: Array<string | number>): string {
  const json = JSON.stringify(values);
  return `${mode}.${Buffer.from(json, 'utf8').toString('base64url')}`;
}

export function decodeCursor(cursor: string, mode: string, shape: Array<'s' | 'n'>) {
  const bad = () => new DomainError('invalid', 'invalid cursor');
  const dot = cursor.indexOf('.');
  if (dot < 0 || cursor.slice(0, dot) !== mode) throw bad();
  let values: unknown;
  try {
    values = JSON.parse(Buffer.from(cursor.slice(dot + 1), 'base64url').toString('utf8'));
  } catch {
    throw bad();
  }
  if (!Array.isArray(values) || values.length !== shape.length) throw bad();
  values.forEach((v, i) => {
    if (shape[i] === 's' ? typeof v !== 'string' : typeof v !== 'number' || !Number.isFinite(v)) {
      throw bad();
    }
  });
  return values as Array<string | number>;
}

/** Clamps page sizes so a caller can't ask for an unbounded result. */
export function pageLimit(limit: number, max = 200): number {
  if (!Number.isInteger(limit) || limit < 1) throw new DomainError('invalid', 'invalid limit');
  return Math.min(limit, max);
}
