import { EMBEDDING_PASSAGE_PREFIX } from '@askcalls/indexing';
import type { Embedder } from './ports';
import type { HighlightRange } from './search';

/** Phrases longer than this are cut into pieces of `PIECE_WORDS`, so a mark stays readable. */
const MAX_PHRASE_WORDS = 12;
const PIECE_WORDS = 8;
/** At most this many phrases per snippet are embedded. */
const MAX_PHRASES = 12;
/**
 * Shorter phrases are never marked: filler like "right? Exactly" sits near every query, so it
 * would win whenever nothing in the snippet is related.
 */
const MIN_MARK_WORDS = 3;

const WORD = /[^\s]+/gu;
const BREAK = /[.!?…;:,\n]/u;

/**
 * Short phrases of `text`, as ranges: split at sentence and clause punctuation, long clauses cut
 * into word pieces. A one-word fragment joins the phrase after it (the last one joins the one
 * before).
 */
export function phraseRanges(text: string): HighlightRange[] {
  const words = [...text.matchAll(WORD)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    breaks: BREAK.test(m[0].slice(-1)),
  }));
  const clauses: (typeof words)[] = [];
  let current: typeof words = [];
  for (const w of words) {
    current.push(w);
    if (w.breaks) {
      clauses.push(current);
      current = [];
    }
  }
  if (current.length) clauses.push(current);

  const pieces: (typeof words)[] = [];
  for (const c of clauses) {
    if (c.length <= MAX_PHRASE_WORDS) {
      pieces.push(c);
      continue;
    }
    for (let i = 0; i < c.length; i += PIECE_WORDS) pieces.push(c.slice(i, i + PIECE_WORDS));
  }
  const merged: (typeof words)[] = [];
  let carry: typeof words = [];
  for (const p of pieces) {
    const piece = [...carry, ...p];
    carry = piece.length < 2 ? piece : [];
    if (piece.length >= 2) merged.push(piece);
  }
  if (carry.length) {
    const last = merged[merged.length - 1];
    if (last) last.push(...carry);
    else merged.push(carry);
  }
  return merged.map((p) => ({
    start: p[0]!.start,
    end: p[p.length - 1]!.end - (p[p.length - 1]!.breaks ? 1 : 0),
  }));
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * For a meaning search: the phrase of each snippet closest to the query, found on the device by
 * embedding the decrypted phrases. A snippet of one phrase gets none, since marking all of it
 * says nothing, and only phrases of `MIN_MARK_WORDS` or more are candidates.
 */
export async function meaningHighlights(
  embedder: Embedder,
  query: Float32Array,
  snippets: readonly (string | null)[],
): Promise<(HighlightRange | null)[]> {
  const candidates = snippets.map((s) => {
    if (!s) return [];
    const all = phraseRanges(s);
    if (all.length < 2) return [];
    return all
      .filter((r) => wordCount(s.slice(r.start, r.end)) >= MIN_MARK_WORDS)
      .slice(0, MAX_PHRASES);
  });
  const texts = candidates.flatMap((ps, i) =>
    ps.map((r) => EMBEDDING_PASSAGE_PREFIX + snippets[i]!.slice(r.start, r.end)),
  );
  if (texts.length === 0) return snippets.map(() => null);
  const vectors = await embedder.embed(texts);
  let at = 0;
  return candidates.map((ps) => {
    let best: HighlightRange | null = null;
    let bestScore = -Infinity;
    for (const r of ps) {
      const score = cosine(query, vectors[at++]!);
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return best;
  });
}

function wordCount(text: string): number {
  return text.match(WORD)?.length ?? 0;
}
