import type { Transcript, TranscriptSegment } from '@askcalls/domain';

/** Collapses whitespace and trims. Keeps every visible character (Hebrew, RTL marks, emoji). */
export function cleanText(text: string): string {
  return text
    .replace(/[\u00a0\t\f\v\u2000-\u200a\u202f\u205f\u3000\n]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function cleanSpeaker(speaker: string | undefined | null): string | undefined {
  if (speaker === undefined || speaker === null) return undefined;
  const s = cleanText(String(speaker));
  return s.length > 0 ? s : undefined;
}

const finite = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/**
 * Makes a segment list safe to store: trimmed text, no empty segments, non-negative times,
 * `end >= start`, sorted by start (stable, so overlapping cues keep their original order).
 * Overlaps are kept: two people talking at once is real.
 */
export function normalizeSegments(segments: readonly TranscriptSegment[]): TranscriptSegment[] {
  const out: Array<TranscriptSegment & { i: number }> = [];
  segments.forEach((seg, i) => {
    const text = cleanText(seg.text ?? '');
    if (text.length === 0) return;
    const start = Math.max(0, finite(seg.start));
    const end = Math.max(start, finite(seg.end));
    const speaker = cleanSpeaker(seg.speaker);
    out.push(speaker ? { start, end, speaker, text, i } : { start, end, text, i });
  });
  out.sort((a, b) => a.start - b.start || a.i - b.i);
  return out.map(({ i: _i, ...seg }) => seg);
}

/** Builds the stored transcript: normalized segments and their text joined by newlines. */
export function buildTranscript(segments: readonly TranscriptSegment[]): Transcript {
  const normalized = normalizeSegments(segments);
  return { segments: normalized, text: normalized.map((s) => s.text).join('\n') };
}

/** Words per second used to estimate durations when a format has no end times (150 wpm). */
export const SPEECH_WORDS_PER_SECOND = 2.5;

export function estimateDuration(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / SPEECH_WORDS_PER_SECOND) * 10) / 10);
}

/** True when any segment carries a non-zero time. */
export function isTimed(segments: readonly TranscriptSegment[]): boolean {
  return segments.some((s) => s.start > 0 || s.end > 0);
}
