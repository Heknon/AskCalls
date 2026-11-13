import type { AskPart } from '@askcalls/ui/components/AskMessage';

const CLOCK = /\[?\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b\]?/g;

/**
 * Splits an answer into text and timestamp citations ("0:48", "[00:01:05]"). Times past the
 * end of the call stay text, so a clock time such as "14:32" is not taken for a citation.
 */
export function parseCitations(text: string, durationSec: number): AskPart[] {
  const parts: AskPart[] = [];
  let last = 0;
  for (const m of text.matchAll(CLOCK)) {
    const [h, min, sec] = [Number(m[1] ?? 0), Number(m[2]), Number(m[3])];
    if (sec > 59 || (m[1] !== undefined && min > 59)) continue;
    const seconds = h * 3600 + min * 60 + sec;
    if (seconds > durationSec) continue;
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ seconds });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
