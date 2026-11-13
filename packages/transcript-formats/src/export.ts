import type { Transcript, TranscriptSegment } from '@askcalls/domain';
import { estimateDuration, isTimed } from './segments';
import { formatClock, formatSrtTime } from './timecode';

export interface TxtExportOptions {
  /** Prefix each line with `[HH:MM:SS]`. Default: true when the transcript has times. */
  timestamps?: boolean;
  /** Prefix each line with `Speaker: `. Default: true. */
  speakers?: boolean;
}

const segmentsOf = (t: Transcript | readonly TranscriptSegment[]) =>
  Array.isArray(t) ? (t as readonly TranscriptSegment[]) : (t as Transcript).segments;

/** One line per segment: `[00:01:02] Speaker: text`. Re-imports losslessly with the TXT parser. */
export function toTxt(
  t: Transcript | readonly TranscriptSegment[],
  opts: TxtExportOptions = {},
): string {
  const segments = segmentsOf(t);
  const timestamps = opts.timestamps ?? isTimed(segments);
  const speakers = opts.speakers ?? true;
  const lines = segments.map((s) => {
    let line = '';
    if (timestamps) line += `[${formatClock(s.start)}] `;
    if (speakers && s.speaker) line += `${s.speaker}: `;
    return line + s.text.replace(/\s*\n\s*/g, ' ');
  });
  return lines.length ? `${lines.join('\n')}\n` : '';
}

/**
 * SubRip. Untimed transcripts get sequential times estimated from word count, and zero-length
 * cues are stretched to the estimate, since players drop cues that end where they start.
 */
export function toSrt(t: Transcript | readonly TranscriptSegment[]): string {
  const segments = segmentsOf(t);
  const timed = isTimed(segments);
  let clock = 0;
  const blocks = segments.map((s, i) => {
    let start = s.start;
    let end = s.end;
    if (!timed) {
      start = clock;
      end = clock + estimateDuration(s.text);
      clock = end;
    } else if (end <= start) {
      end = start + estimateDuration(s.text);
    }
    const text = (s.speaker ? `${s.speaker}: ${s.text}` : s.text).replace(/\s*\n\s*/g, ' ');
    return `${i + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${text}\n`;
  });
  return blocks.join('\n');
}
