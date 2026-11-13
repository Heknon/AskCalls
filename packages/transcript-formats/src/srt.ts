import type { TranscriptSegment } from '@askcalls/domain';
import { hasSpeakerPrefixes, splitSpeakerPrefix } from './speaker';
import { parseTimecode } from './timecode';

const TC = String.raw`(?:\d{1,3}:)?\d{1,2}:\d{2}(?:[,.]\d{1,3})?`;
export const SRT_TIMING = new RegExp(String.raw`^\s*(${TC})\s*-->\s*(${TC})`);

/** Removes HTML-ish formatting (`<i>`, `<font …>`) and ASS overrides (`{\an8}`). */
export function stripCueMarkup(text: string): string {
  return text
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

interface Cue {
  start: number;
  end: number;
  lines: string[];
}

/** One segment per cue line group; a cue with `- ` dialogue lines becomes one segment per line. */
export function cuesToSegments(cues: readonly Cue[]): TranscriptSegment[] {
  const parts: Array<{ start: number; end: number; text: string }> = [];
  for (const cue of cues) {
    const lines = cue.lines.map((l) => stripCueMarkup(l).trim()).filter(Boolean);
    const dialogue = lines.length > 1 && lines.every((l) => /^[-–—]\s/.test(l));
    if (dialogue) {
      for (const l of lines)
        parts.push({ start: cue.start, end: cue.end, text: l.slice(1).trim() });
    } else if (lines.length > 0) {
      parts.push({ start: cue.start, end: cue.end, text: lines.join(' ') });
    }
  }
  const speakerMode = hasSpeakerPrefixes(parts.map((p) => p.text));
  return parts.map((p) => {
    const prefixed = speakerMode ? splitSpeakerPrefix(p.text) : null;
    return prefixed
      ? { start: p.start, end: p.end, speaker: prefixed.speaker, text: prefixed.text }
      : { start: p.start, end: p.end, text: p.text };
  });
}

export function parseSrt(input: string): TranscriptSegment[] {
  const cues: Cue[] = [];
  let current: Cue | null = null;
  for (const line of input.split('\n')) {
    const timing = SRT_TIMING.exec(line);
    if (timing) {
      const start = parseTimecode(timing[1]!);
      const end = parseTimecode(timing[2]!);
      if (start !== null && end !== null) {
        // A cue number line just before the timing belongs to the new cue, not the old text.
        if (current && /^\s*\d+\s*$/.test(current.lines[current.lines.length - 1] ?? '')) {
          current.lines.pop();
        }
        current = { start, end, lines: [] };
        cues.push(current);
        continue;
      }
    }
    if (!current) continue;
    if (line.trim() === '') {
      current.lines.push('');
      continue;
    }
    current.lines.push(line);
  }
  // Trailing blank lines and cue numbers that preceded the next cue were collected; drop blanks.
  for (const cue of cues) cue.lines = cue.lines.filter((l) => l.trim() !== '');
  return cuesToSegments(cues);
}
