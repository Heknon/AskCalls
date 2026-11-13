import type { TranscriptSegment } from '@askcalls/domain';

const YOU = /^(you|me|agent|אני|את|אתה)$/i;
const GENERIC = /^(speaker|spk|s|דובר)?[\s_-]*\d+$/i;

export type SpeakerLabel = { name: string; isYou: boolean };

/**
 * Names for each turn's speaker: "You" for the user, the contact for a speaker the transcript
 * names after them, "Speaker 1/2" for generic or missing labels, numbered by first appearance.
 */
export function speakerLabels(
  segments: readonly TranscriptSegment[],
  labels: { you: string; speaker: (n: number) => string },
): SpeakerLabel[] {
  const numbered = new Map<string, number>();
  return segments.map((s) => {
    const raw = s.speaker?.trim() ?? '';
    if (YOU.test(raw)) return { name: labels.you, isYou: true };
    if (raw && !GENERIC.test(raw)) return { name: raw, isYou: false };
    const key = raw || '?';
    if (!numbered.has(key)) numbered.set(key, numbered.size + 1);
    return { name: labels.speaker(numbered.get(key)!), isYou: false };
  });
}
