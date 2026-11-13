import type { TranscriptSegment } from '@askcalls/domain';

/** Spec 7.8–7.9. */
export const CHUNK_TARGET_WORDS = 120;
export const CHUNK_OVERLAP_WORDS = 20;
/** How far a chunk end may move from the target to land on a segment boundary. */
export const CHUNK_SNAP_WORDS = 30;
export const SNIPPET_MAX_CHARS = 300;

export interface ChunkOptions {
  targetWords?: number;
  overlapWords?: number;
  snapWords?: number;
}

export interface TextChunk {
  ord: number;
  /** Words of the chunk joined by single spaces. */
  text: string;
  /** Word range [wordStart, wordEnd) in the call's word stream. */
  wordStart: number;
  wordEnd: number;
  /** Seconds, interpolated within segments by word position. */
  startSec: number;
  endSec: number;
}

interface Word {
  text: string;
  seg: number;
  /** Position of the word inside its segment, and the segment's word count. */
  i: number;
  n: number;
}

function closest(candidates: readonly number[], lo: number, hi: number, ideal: number): number | null {
  let best: number | null = null;
  for (const b of candidates) {
    if (b < lo || b > hi) continue;
    if (best === null || Math.abs(b - ideal) < Math.abs(best - ideal)) best = b;
  }
  return best;
}

/**
 * Splits segments into chunks of about `targetWords` words with `overlapWords` of overlap. Chunk
 * ends (and overlap starts) snap to a segment boundary within `snapWords` of the ideal position;
 * a segment longer than that is split inside. A short tail is merged into the last chunk.
 */
export function chunkSegments(
  segments: readonly Pick<TranscriptSegment, 'start' | 'end' | 'text'>[],
  opts: ChunkOptions = {},
): TextChunk[] {
  const target = Math.max(1, opts.targetWords ?? CHUNK_TARGET_WORDS);
  const overlap = Math.min(Math.max(0, opts.overlapWords ?? CHUNK_OVERLAP_WORDS), target - 1);
  const snap = Math.max(0, opts.snapWords ?? CHUNK_SNAP_WORDS);

  const words: Word[] = [];
  const boundaries: number[] = [];
  segments.forEach((s, seg) => {
    const parts = s.text.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return;
    boundaries.push(words.length);
    parts.forEach((text, i) => words.push({ text, seg, i, n: parts.length }));
  });
  const n = words.length;
  if (n === 0) return [];

  const time = (w: Word, edge: 'start' | 'end') => {
    const s = segments[w.seg]!;
    const span = Math.max(0, s.end - s.start);
    const pos = edge === 'start' ? w.i : w.i + 1;
    return s.start + (span * pos) / w.n;
  };

  const chunks: TextChunk[] = [];
  const emit = (from: number, to: number) => {
    chunks.push({
      ord: chunks.length,
      text: words
        .slice(from, to)
        .map((w) => w.text)
        .join(' '),
      wordStart: from,
      wordEnd: to,
      startSec: time(words[from]!, 'start'),
      endSec: time(words[to - 1]!, 'end'),
    });
  };

  let start = 0;
  for (;;) {
    if (n - start <= target + snap) {
      emit(start, n);
      break;
    }
    const ideal = start + target;
    const end = closest(boundaries, Math.max(start + overlap + 1, ideal - snap), ideal + snap, ideal) ?? ideal;
    emit(start, end);
    const idealStart = end - overlap;
    const half = Math.ceil(snap / 3);
    let next = closest(boundaries, Math.max(start + 1, idealStart - half), Math.min(end, idealStart + half), idealStart) ?? idealStart;
    if (next <= start) next = start + 1;
    start = next;
  }
  return chunks;
}

/** Spec 7.9: the chunk's redacted text cut to 300 characters, at a word boundary when one is near. */
export function makeSnippet(text: string, maxChars = SNIPPET_MAX_CHARS): string {
  const chars = [...text];
  if (chars.length <= maxChars) return text;
  const cut = chars.slice(0, maxChars - 1).join('');
  const space = cut.lastIndexOf(' ');
  const base = space >= cut.length - 40 && space > 0 ? cut.slice(0, space) : cut;
  return `${base.trimEnd()}…`;
}
