/**
 * A QR code encoder (ISO/IEC 18004, byte mode, error correction level M) for the device-link
 * code. Runs on this device: the link secret never goes to a QR service. Follows the structure
 * of Project Nayuki's reference implementation.
 */

const ECC_PER_BLOCK_M = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
const BLOCKS_M = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25,
  26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];
/** Format-information bits for level M. */
const ECL_FORMAT_BITS = 0;

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

export function rawDataModules(ver: number): number {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}

export const dataCodewords = (ver: number) =>
  Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver]! * BLOCKS_M[ver]!;

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j]!, root);
      if (j + 1 < degree) result[j]! ^= result[j + 1]!;
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

export function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach((c, i) => {
      result[i]! ^= gfMul(c, factor);
    });
  }
  return result;
}

export function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const size = ver * 4 + 17;
  const count = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** Splits data into blocks, appends each block's ECC, and interleaves them. */
export function withEcc(data: readonly number[], ver: number): number[] {
  const numBlocks = BLOCKS_M[ver]!;
  const eccLen = ECC_PER_BLOCK_M[ver]!;
  const raw = Math.floor(rawDataModules(ver) / 8);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShort) dat.push(0);
    blocks.push([...dat, ...ecc]);
  }
  const out: number[] = [];
  for (let i = 0; i < blocks[0]!.length; i++) {
    blocks.forEach((b, j) => {
      if (i !== shortLen - eccLen || j >= numShort) out.push(b[i]!);
    });
  }
  return out;
}

function encodeData(bytes: Uint8Array): { ver: number; codewords: number[] } {
  let ver = 1;
  for (; ver <= 40; ver++) {
    const countBits = ver <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  }
  if (ver > 40) throw new RangeError('too much data for a QR code');
  const capacity = dataCodewords(ver) * 8;
  const bits: number[] = [];
  const push = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  }
  return { ver, codewords };
}

const MASKS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export function formatBits(mask: number): number {
  const data = (ECL_FORMAT_BITS << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

class Grid {
  readonly size: number;
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];

  constructor(readonly ver: number) {
    this.size = ver * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
  }

  fn(x: number, y: number, dark: boolean) {
    this.modules[y]![x] = dark;
    this.isFunction[y]![x] = true;
  }

  drawFunctionPatterns() {
    const { size } = this;
    for (let i = 0; i < size; i++) {
      this.fn(6, i, i % 2 === 0);
      this.fn(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [
      [3, 3],
      [size - 4, 3],
      [3, size - 4],
    ] as const) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) this.fn(x, y, d !== 2 && d !== 4);
        }
      }
    }
    const pos = alignmentPositions(this.ver);
    const last = pos.length - 1;
    pos.forEach((px, i) => {
      pos.forEach((py, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            this.fn(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      });
    });
    this.drawFormat(0);
    if (this.ver >= 7) {
      let rem = this.ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (this.ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        this.fn(a, b, bit(bits, i));
        this.fn(b, a, bit(bits, i));
      }
    }
  }

  drawFormat(mask: number) {
    const bits = formatBits(mask);
    const { size } = this;
    for (let i = 0; i <= 5; i++) this.fn(8, i, bit(bits, i));
    this.fn(8, 7, bit(bits, 6));
    this.fn(8, 8, bit(bits, 7));
    this.fn(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this.fn(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) this.fn(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this.fn(8, size - 15 + i, bit(bits, i));
    this.fn(8, size - 8, true);
  }

  /** Data module coordinates in placement order (the two-column zigzag). */
  *dataCells(): Generator<[number, number]> {
    const { size } = this;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y]![x]) yield [x, y];
        }
      }
    }
  }

  drawCodewords(data: readonly number[]) {
    let i = 0;
    for (const [x, y] of this.dataCells()) {
      if (i < data.length * 8) this.modules[y]![x] = bit(data[i >>> 3]!, 7 - (i & 7));
      i++;
    }
  }

  applyMask(mask: number) {
    const m = MASKS[mask]!;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.isFunction[y]![x] && m(x, y)) this.modules[y]![x] = !this.modules[y]![x];
      }
    }
  }

  penalty(): number {
    const { size, modules } = this;
    let score = 0;
    const lines = (get: (a: number, b: number) => boolean) => {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b <= size; b++) {
          if (b < size && get(a, b) === get(a, b - 1)) run++;
          else {
            if (run >= 5) score += run - 2;
            run = 1;
          }
        }
        for (let b = 0; b + 11 <= size; b++) {
          const p = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0].every((v, k) => get(a, b + k) === !!v);
          const q = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1].every((v, k) => get(a, b + k) === !!v);
          if (p || q) score += 40;
        }
      }
    };
    lines((y, x) => modules[y]![x]!);
    lines((x, y) => modules[y]![x]!);
    let dark = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = modules[y]![x]!;
        if (c) dark++;
        if (
          x + 1 < size &&
          y + 1 < size &&
          c === modules[y]![x + 1] &&
          c === modules[y + 1]![x] &&
          c === modules[y + 1]![x + 1]
        ) {
          score += 3;
        }
      }
    }
    const total = size * size;
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  }
}

export interface QrCode {
  version: number;
  mask: number;
  /** Row-major, true = dark. */
  modules: boolean[][];
}

export function encodeQr(text: string): QrCode {
  const { ver, codewords } = encodeData(new TextEncoder().encode(text));
  const grid = new Grid(ver);
  grid.drawFunctionPatterns();
  grid.drawCodewords(withEcc(codewords, ver));
  let best = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask++) {
    grid.applyMask(mask);
    grid.drawFormat(mask);
    const s = grid.penalty();
    if (s < bestScore) {
      best = mask;
      bestScore = s;
    }
    grid.applyMask(mask);
  }
  grid.applyMask(best);
  grid.drawFormat(best);
  return { version: ver, mask: best, modules: grid.modules };
}

/** For tests: the function-pattern map and data cell order of a version. */
export function layoutOf(ver: number) {
  const g = new Grid(ver);
  g.drawFunctionPatterns();
  return { isFunction: g.isFunction, cells: [...g.dataCells()] };
}

export const maskFn = (mask: number) => MASKS[mask]!;
