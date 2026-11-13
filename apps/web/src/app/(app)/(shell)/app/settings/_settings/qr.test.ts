import { describe, expect, it } from 'vitest';
import {
  alignmentPositions,
  dataCodewords,
  encodeQr,
  formatBits,
  layoutOf,
  maskFn,
  rawDataModules,
  rsRemainder,
} from './qr';

const ECC_M: Record<number, [blocks: number, ecc: number]> = {
  1: [1, 10],
  3: [1, 26],
  5: [2, 24],
  8: [4, 22],
  9: [5, 22],
  10: [5, 26],
};

/** Reads a symbol back: format, unmask, de-interleave, RS check, byte-mode payload. */
function decode(modules: boolean[][], version: number) {
  const size = modules.length;
  let format = 0;
  const firstCopy: Array<[number, number]> = [
    ...[0, 1, 2, 3, 4, 5].map((i) => [8, i] as [number, number]),
    [8, 7],
    [8, 8],
    [7, 8],
    ...[9, 10, 11, 12, 13, 14].map((i) => [14 - i, 8] as [number, number]),
  ];
  firstCopy.forEach(([x, y], i) => {
    if (modules[y]![x]) format |= 1 << i;
  });
  const mask = [0, 1, 2, 3, 4, 5, 6, 7].find((m) => formatBits(m) === format);
  expect(mask).toBeDefined();
  const { cells } = layoutOf(version);
  const bits = cells.map(([x, y]) => modules[y]![x] !== maskFn(mask!)(x, y));
  const raw = Math.floor(rawDataModules(version) / 8);
  const words: number[] = [];
  for (let i = 0; i < raw; i++) {
    words.push(bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | (b ? 1 : 0), 0));
  }
  const [numBlocks, eccLen] = ECC_M[version]!;
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const blocks: number[][] = Array.from({ length: numBlocks }, () => []);
  let k = 0;
  for (let i = 0; i < shortLen + 1; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i === shortLen - eccLen && j < numShort) continue;
      blocks[j]!.push(words[k++]!);
    }
  }
  const gen = rsRemainderGenerator(eccLen);
  const data: number[] = [];
  for (const b of blocks) {
    expect(rsRemainder(b, gen).every((v) => v === 0)).toBe(true);
    data.push(...b.slice(0, b.length - eccLen));
  }
  const bitsOf = data.flatMap((w) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (w >>> i) & 1));
  const read = (from: number, n: number) => bitsOf.slice(from, from + n).reduce((a, b) => a * 2 + b);
  expect(read(0, 4)).toBe(0b0100);
  const countBits = version <= 9 ? 8 : 16;
  const len = read(4, countBits);
  const bytes = Array.from({ length: len }, (_, i) => read(4 + countBits + i * 8, 8));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** The generator polynomial, recovered as the remainder of x^n (the encoder's divisor). */
function rsRemainderGenerator(degree: number): number[] {
  const mul = (x: number, y: number) => {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  };
  const r = new Array<number>(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      r[j] = mul(r[j]!, root);
      if (j + 1 < degree) r[j]! ^= r[j + 1]!;
    }
    root = mul(root, 2);
  }
  return r;
}

describe('QR encoder', () => {
  it('leaves exactly the raw data modules free in every version', () => {
    for (let v = 1; v <= 40; v++) expect(layoutOf(v).cells.length, `v${v}`).toBe(rawDataModules(v));
  });

  it('places alignment patterns as the standard table', () => {
    expect(alignmentPositions(2)).toEqual([6, 18]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(10)).toEqual([6, 28, 50]);
    expect(alignmentPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
  });

  it('uses the level M capacities', () => {
    expect(dataCodewords(1)).toBe(16);
    expect(dataCodewords(5)).toBe(86);
    expect(dataCodewords(10)).toBe(216);
  });

  it('encodes the format information with the standard BCH code', () => {
    // Level M, mask 0 (ISO/IEC 18004 table C.1).
    expect(formatBits(0)).toBe(0b101010000010010);
  });

  it.each([
    ['A', 1],
    ['https://askcalls.com/app/settings/security', 3],
    ['x'.repeat(150), 8],
    ['z'.repeat(170), 9],
    ['y'.repeat(200), 10],
  ])('round-trips %#', (text, version) => {
    const qr = encodeQr(text);
    expect(qr.version).toBe(version);
    expect(qr.modules).toHaveLength(version * 4 + 17);
    expect(decode(qr.modules, version)).toBe(text);
    // Finder pattern corners and the dark module.
    expect(qr.modules[0]![0]).toBe(true);
    expect(qr.modules[1]![1]).toBe(false);
    expect(qr.modules[qr.modules.length - 8]![8]).toBe(true);
  });
});
