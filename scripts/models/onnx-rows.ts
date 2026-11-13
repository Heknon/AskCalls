/**
 * Replaces one 2-D initializer of an ONNX model with a subset of its rows, by rewriting the
 * protobuf in place: every other byte of the model (graph, attributes, other initializers,
 * quantization scales and zero points) is copied unchanged.
 *
 * Field numbers from onnx.proto: ModelProto.graph = 7, GraphProto.initializer = 5,
 * TensorProto.dims = 1, data_type = 2, name = 8, raw_data = 9.
 */

interface Field {
  no: number;
  wire: number;
  start: number;
  end: number;
  /** Payload bounds for length-delimited fields. */
  body?: [number, number];
}

function varint(buf: Uint8Array, pos: number): [value: number, next: number] {
  let v = 0;
  let mul = 1;
  for (let i = pos; ; i++) {
    const b = buf[i];
    if (b === undefined) throw new Error('truncated varint');
    v += (b & 0x7f) * mul;
    mul *= 128;
    if (b < 0x80) return [v, i + 1];
  }
}

function encodeVarint(v: number): number[] {
  const out: number[] = [];
  while (v >= 0x80) {
    out.push((v % 128) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return out;
}

function* fields(buf: Uint8Array, from: number, to: number): Generator<Field> {
  let pos = from;
  while (pos < to) {
    const start = pos;
    const [key, p] = varint(buf, pos);
    const no = Math.floor(key / 8);
    const wire = key % 8;
    pos = p;
    if (wire === 0) pos = varint(buf, pos)[1];
    else if (wire === 1) pos += 8;
    else if (wire === 5) pos += 4;
    else if (wire === 2) {
      const [len, q] = varint(buf, pos);
      yield { no, wire, start, end: q + len, body: [q, q + len] };
      pos = q + len;
      continue;
    } else throw new Error(`unsupported wire type ${wire}`);
    yield { no, wire, start, end: pos };
  }
  if (pos !== to) throw new Error('malformed message');
}

const lengthDelimited = (no: number, payload: Uint8Array[]): Uint8Array[] => {
  const len = payload.reduce((n, p) => n + p.length, 0);
  return [Uint8Array.from([...encodeVarint(no * 8 + 2), ...encodeVarint(len)]), ...payload];
};

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const decoder = new TextDecoder();

function tensorName(buf: Uint8Array, body: [number, number]): string | null {
  for (const f of fields(buf, body[0], body[1])) {
    if (f.no === 8 && f.body) return decoder.decode(buf.subarray(f.body[0], f.body[1]));
  }
  return null;
}

function dims(buf: Uint8Array, body: [number, number]): number[] {
  const out: number[] = [];
  for (const f of fields(buf, body[0], body[1])) {
    if (f.no !== 1) continue;
    if (f.wire === 0) out.push(varint(buf, varint(buf, f.start)[1])[0]);
    else if (f.body) {
      for (let p = f.body[0]; p < f.body[1]; ) {
        const [v, n] = varint(buf, p);
        out.push(v);
        p = n;
      }
    }
  }
  return out;
}

function rewriteTensor(
  buf: Uint8Array,
  body: [number, number],
  rows: readonly number[],
): { tensor: Uint8Array[]; shape: number[] } {
  const shape = dims(buf, body);
  if (shape.length !== 2) throw new Error('initializer is not 2-D');
  const [count, width] = shape as [number, number];
  const parts: Uint8Array[] = [];
  let rawSeen = false;
  let dimsWritten = false;
  for (const f of fields(buf, body[0], body[1])) {
    if (f.no === 1) {
      if (!dimsWritten) {
        parts.push(
          Uint8Array.from([0x08, ...encodeVarint(rows.length), 0x08, ...encodeVarint(width)]),
        );
        dimsWritten = true;
      }
      continue;
    }
    if (f.no === 9 && f.body) {
      const raw = buf.subarray(f.body[0], f.body[1]);
      const rowBytes = raw.length / count;
      if (!Number.isInteger(rowBytes) || rowBytes % width !== 0) throw new Error('raw size');
      const next = new Uint8Array(rows.length * rowBytes);
      rows.forEach((r, i) => {
        if (r < 0 || r >= count) throw new Error(`row ${r} out of range`);
        next.set(raw.subarray(r * rowBytes, (r + 1) * rowBytes), i * rowBytes);
      });
      parts.push(...lengthDelimited(9, [next]));
      rawSeen = true;
      continue;
    }
    if ([4, 5, 7, 10, 11, 13].includes(f.no)) throw new Error('initializer must use raw_data');
    parts.push(buf.subarray(f.start, f.end));
  }
  if (!rawSeen) throw new Error('initializer has no raw_data');
  return { tensor: parts, shape };
}

/**
 * Returns `model` with initializer `name` reduced to `rows` (in that order) and the row count
 * of the original tensor, which callers check against the tokenizer.
 */
export function selectInitializerRows(
  model: Uint8Array,
  name: string,
  rows: readonly number[],
): { model: Uint8Array; originalRows: number } {
  let originalRows = -1;
  const top: Uint8Array[] = [];
  for (const mf of fields(model, 0, model.length)) {
    if (mf.no !== 7 || !mf.body) {
      top.push(model.subarray(mf.start, mf.end));
      continue;
    }
    const graph: Uint8Array[] = [];
    for (const gf of fields(model, mf.body[0], mf.body[1])) {
      if (gf.no === 5 && gf.body && tensorName(model, gf.body) === name) {
        const { tensor, shape } = rewriteTensor(model, gf.body, rows);
        originalRows = shape[0]!;
        graph.push(...lengthDelimited(5, tensor));
      } else {
        graph.push(model.subarray(gf.start, gf.end));
      }
    }
    top.push(...lengthDelimited(7, graph));
  }
  if (originalRows < 0) throw new Error(`initializer ${name} not found`);
  return { model: concat(top), originalRows };
}
