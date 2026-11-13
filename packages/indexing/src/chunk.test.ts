import { describe, expect, it } from 'vitest';
import { CHUNK_OVERLAP_WORDS, chunkSegments, makeSnippet, SNIPPET_MAX_CHARS } from './chunk';

/** Segments of the given word counts, words numbered globally (w0, w1, …), 1 second per word. */
function segmentsOf(sizes: number[]) {
  let n = 0;
  return sizes.map((size) => {
    const words = Array.from({ length: size }, () => `w${n++}`);
    const start = n - size;
    return { start, end: n, text: words.join(' ') };
  });
}

const wordsOf = (text: string) => text.split(' ');

describe('chunkSegments', () => {
  it('returns nothing for empty input', () => {
    expect(chunkSegments([])).toEqual([]);
    expect(chunkSegments([{ start: 0, end: 1, text: '   ' }])).toEqual([]);
  });

  it('keeps a short call in one chunk', () => {
    const chunks = chunkSegments(segmentsOf([40, 50, 40]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      ord: 0,
      wordStart: 0,
      wordEnd: 130,
      startSec: 0,
      endSec: 130,
    });
  });

  it('ends chunks on segment boundaries near 120 words and overlaps by about 20', () => {
    const sizes = Array.from({ length: 40 }, () => 10); // 400 words, boundary every 10
    const chunks = chunkSegments(segmentsOf(sizes));
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const [i, c] of chunks.entries()) {
      expect(c.ord).toBe(i);
      if (i < chunks.length - 1) {
        expect(c.wordEnd % 10).toBe(0);
        expect(c.wordEnd - c.wordStart).toBe(120);
        const next = chunks[i + 1]!;
        expect(c.wordEnd - next.wordStart).toBe(CHUNK_OVERLAP_WORDS);
        // Overlapping words are identical text.
        expect(wordsOf(c.text).slice(-20)).toEqual(wordsOf(next.text).slice(0, 20));
      }
    }
    expect(chunks.at(-1)!.wordEnd).toBe(400);
  });

  it('snaps to the boundary closest to the target', () => {
    // Boundaries at 0, 100, 135, 300: the first chunk ends at 135 (15 from 120) rather than 100.
    const chunks = chunkSegments(segmentsOf([100, 35, 165, 50]));
    expect(chunks[0]!.wordEnd).toBe(135);
  });

  it('splits inside a segment longer than the snap window', () => {
    const chunks = chunkSegments(segmentsOf([500]));
    expect(chunks[0]!.wordEnd).toBe(120);
    expect(chunks[1]!.wordStart).toBe(100);
    expect(chunks.at(-1)!.wordEnd).toBe(500);
    // Times are interpolated inside the segment (1 s per word here).
    expect(chunks[1]!.startSec).toBe(100);
    expect(chunks[1]!.endSec).toBe(220);
  });

  it('covers every word, in order, with no gaps', () => {
    const sizes = [7, 33, 12, 90, 3, 41, 18, 66, 25, 9, 120, 14];
    const chunks = chunkSegments(segmentsOf(sizes));
    const total = sizes.reduce((a, b) => a + b, 0);
    expect(chunks[0]!.wordStart).toBe(0);
    expect(chunks.at(-1)!.wordEnd).toBe(total);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.wordStart).toBeLessThan(chunks[i - 1]!.wordEnd);
      expect(chunks[i]!.wordStart).toBeGreaterThan(chunks[i - 1]!.wordStart);
    }
  });

  it('merges a short tail into the last chunk', () => {
    const chunks = chunkSegments(segmentsOf([120, 25]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.wordEnd).toBe(145);
  });

  it('honors custom sizes', () => {
    const chunks = chunkSegments(segmentsOf([10, 10, 10, 10, 10, 10]), {
      targetWords: 20,
      overlapWords: 5,
      snapWords: 0,
    });
    expect(chunks.map((c) => [c.wordStart, c.wordEnd])).toEqual([
      [0, 20],
      [15, 35],
      [30, 50],
      [45, 60],
    ]);
  });
});

describe('makeSnippet', () => {
  it('leaves short text alone', () => {
    expect(makeSnippet('שלום עולם')).toBe('שלום עולם');
  });
  it('cuts to 300 characters at a word boundary with an ellipsis', () => {
    const text = Array.from({ length: 100 }, (_, i) => `מילה${i}`).join(' ');
    const s = makeSnippet(text);
    expect([...s].length).toBeLessThanOrEqual(SNIPPET_MAX_CHARS);
    expect(s.endsWith('…')).toBe(true);
    expect(text.startsWith(s.slice(0, -1))).toBe(true);
    expect(s.slice(0, -1).endsWith(' ')).toBe(false);
  });
  it('never splits a surrogate pair', () => {
    const s = makeSnippet('😀'.repeat(400));
    expect([...s].length).toBe(SNIPPET_MAX_CHARS);
    expect(s).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });
});
