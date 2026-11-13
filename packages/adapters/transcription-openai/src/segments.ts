import type { TranscriptSegment } from '@askcalls/domain';

export interface TimedWord {
  text: string;
  start: number;
  end: number;
  /** Provider speaker id, any format. */
  speaker?: string | null;
}

export interface GroupOptions {
  /** Silence that starts a new segment, in seconds. */
  maxGapSec?: number;
  /** Longest segment before it breaks at the next sentence end, in seconds. */
  softMaxSec?: number;
  /** Longest segment, broken at the next word regardless, in seconds. */
  hardMaxSec?: number;
}

const SENTENCE_END = /[.!?…؟。]["'”’)]*$/u;

/**
 * Speaker labels by order of first appearance: A, B, C … Z, then S27, S28 …
 * Labels are per transcription request; the ingest pipeline reconciles them across chunks.
 */
export class SpeakerLabels {
  private readonly map = new Map<string, string>();
  label(raw: string | null | undefined): string | undefined {
    if (raw === null || raw === undefined || raw === '') return undefined;
    let l = this.map.get(raw);
    if (!l) {
      const n = this.map.size;
      l = n < 26 ? String.fromCharCode(65 + n) : `S${n + 1}`;
      this.map.set(raw, l);
    }
    return l;
  }
}

/**
 * Groups timed words (text already carrying its own spacing) into segments: a new segment starts
 * on a speaker change, after a pause, or when a long segment reaches a sentence end.
 */
export function groupWords(words: TimedWord[], opts: GroupOptions = {}): TranscriptSegment[] {
  const maxGap = opts.maxGapSec ?? 1.5;
  const softMax = opts.softMaxSec ?? 20;
  const hardMax = opts.hardMaxSec ?? 60;
  const labels = new SpeakerLabels();
  const out: TranscriptSegment[] = [];
  let cur: { start: number; end: number; speaker: string | undefined; text: string } | null = null;

  const flush = () => {
    if (!cur) return;
    const text = cur.text.replace(/\s+/g, ' ').trim();
    if (text) {
      out.push({
        start: cur.start,
        end: Math.max(cur.end, cur.start),
        ...(cur.speaker ? { speaker: cur.speaker } : {}),
        text,
      });
    }
    cur = null;
  };

  for (const w of words) {
    const speaker = labels.label(w.speaker);
    const isSpace = w.text.trim() === '';
    if (cur && !isSpace) {
      const len = cur.end - cur.start;
      const breakHere =
        speaker !== cur.speaker ||
        w.start - cur.end > maxGap ||
        len >= hardMax ||
        (len >= softMax && SENTENCE_END.test(cur.text.trimEnd()));
      if (breakHere) flush();
    }
    if (!cur) {
      if (isSpace) continue;
      cur = { start: w.start, end: w.end, speaker, text: '' };
    }
    cur.text += w.text;
    if (!isSpace) cur.end = Math.max(cur.end, w.end);
  }
  flush();
  return out;
}
