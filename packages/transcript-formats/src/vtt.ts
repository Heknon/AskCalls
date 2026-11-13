import type { TranscriptSegment } from '@askcalls/domain';
import { hasSpeakerPrefixes, splitSpeakerPrefix } from './speaker';
import { parseTimecode } from './timecode';

const TC = String.raw`(?:\d{1,3}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?`;
const TIMING = new RegExp(String.raw`^\s*(${TC})\s+-->\s+(${TC})`);
const VOICE_SPLIT = /(<v(?:\.[^\s>]*)?(?:\s+[^>]*)?>|<\/v>)/;
const VOICE_OPEN = /^<v(?:\.[^\s>]*)?(?:\s+([^>]*))?>$/;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  nbsp: ' ',
  lrm: '\u200e',
  rlm: '\u200f',
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, name: string) => {
    if (name[0] === '#') {
      const cp =
        name[1] === 'x' || name[1] === 'X'
          ? Number.parseInt(name.slice(2), 16)
          : Number(name.slice(1));
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[name.toLowerCase()] ?? m;
  });
}

/** Strips class, bold, italic, ruby, language and inline timestamp tags (`<00:01.000>`). */
function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

interface Span {
  start: number;
  end: number;
  speaker?: string;
  text: string;
}

function spansOf(payload: string, start: number, end: number): Span[] {
  const spans: Span[] = [];
  let voice: string | undefined;
  let buffer = '';
  const flush = () => {
    const text = decodeEntities(stripTags(buffer)).replace(/\s+/g, ' ').trim();
    if (text) spans.push(voice ? { start, end, speaker: voice, text } : { start, end, text });
    buffer = '';
  };
  for (const part of payload.split(VOICE_SPLIT)) {
    const open = VOICE_OPEN.exec(part);
    if (open) {
      flush();
      const name = decodeEntities(open[1] ?? '').trim();
      voice = name || undefined;
    } else if (part === '</v>') {
      flush();
      voice = undefined;
    } else {
      buffer += part;
    }
  }
  flush();
  return spans;
}

export function parseVtt(input: string): TranscriptSegment[] {
  const blocks = input.split(/\n[ \t]*\n/);
  const spans: Span[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l, i) => i > 0 || l.trim() !== '');
    const first = lines[0]?.trim() ?? '';
    if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(first)) continue;
    const timingIdx = lines.findIndex((l) => TIMING.test(l));
    if (timingIdx < 0 || timingIdx > 1) continue;
    const m = TIMING.exec(lines[timingIdx]!)!;
    const start = parseTimecode(m[1]!);
    const end = parseTimecode(m[2]!);
    if (start === null || end === null) continue;
    const payload = lines.slice(timingIdx + 1).join('\n');
    spans.push(...spansOf(payload, start, end));
  }
  // Cues without voice tags may still use "Name: text".
  const unvoiced = spans.filter((s) => s.speaker === undefined);
  if (hasSpeakerPrefixes(unvoiced.map((s) => s.text))) {
    for (const s of unvoiced) {
      const p = splitSpeakerPrefix(s.text);
      if (p) {
        s.speaker = p.speaker;
        s.text = p.text;
      }
    }
  }
  return spans;
}
