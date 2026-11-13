import type { Transcript } from '@askcalls/domain';
import { analyzeCall } from '@askcalls/indexing';

/**
 * Where a semantic hit's chunk starts: its language and the segment it begins in. Chunks are
 * re-cut from the decrypted transcript exactly as at indexing (same contact names), so `ord`
 * from the search result points at the same text.
 */
export function locateChunk(
  transcript: Transcript,
  language: string | null,
  ord: number,
  contactNames: readonly string[] = [],
): { lang: string | null; translated: boolean; segment: number } | null {
  const chunk = analyzeCall({
    transcript,
    language,
    contacts: contactNames.map((name) => ({ name })),
  }).chunks.find((c) => c.ord === ord);
  if (!chunk) return null;
  const segments = chunk.translated
    ? (transcript.translations?.[chunk.lang ?? '']?.segments ?? transcript.segments)
    : transcript.segments;
  const segment = Math.max(
    0,
    segments.findLastIndex((s) => s.start <= chunk.startSec + 1e-6),
  );
  return { lang: chunk.lang, translated: chunk.translated, segment };
}
