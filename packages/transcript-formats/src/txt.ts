import type { TranscriptSegment } from '@askcalls/domain';
import { estimateDuration } from './segments';
import { hasSpeakerPrefixes, isSpeakerLabel, splitSpeakerPrefix } from './speaker';
import { parseTimecode } from './timecode';

/**
 * Plain-text transcripts. Recognized line styles:
 * - plain text (one segment per line, untimed)
 * - `Speaker: text` (lines without a prefix continue the previous turn)
 * - `[00:01:02] Speaker: text`, `(01:02) text`, `00:01:02 - Speaker: text`
 * - `Speaker [00:01:02]: text`
 * - header lines `Speaker 1  0:03` followed by the turn's text (Otter, many recorders)
 */
const TC = String.raw`\d{1,3}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?`;
const BRACKETED_TS = new RegExp(String.raw`^\s*[[(]\s*(${TC})\s*[\])]\s*(?:[-–—|]\s*)?`);
const BARE_TS = new RegExp(String.raw`^\s*(${TC})(?:\s+[-–—|])?(?:\s+|$)`);
const HEADER = new RegExp(String.raw`^(.{1,40}?)\s+[[(]?(${TC})[\])]?\s*$`);
const LABEL_TS = new RegExp(String.raw`^(.{1,40}?)\s*[[(](${TC})[\])]\s*[:：]\s*(.*)$`);

type Line =
  | { kind: 'blank' }
  | { kind: 'header'; start: number; speaker: string }
  | { kind: 'text'; start?: number; speaker?: string; text: string; bare: boolean };

function analyze(raw: string): Line {
  const line = raw.trim();
  if (line.length === 0) return { kind: 'blank' };

  const header = HEADER.exec(line);
  if (header && isSpeakerLabel(header[1]!)) {
    const start = parseTimecode(header[2]!);
    if (start !== null) return { kind: 'header', start, speaker: header[1]!.trim() };
  }
  const labelTs = LABEL_TS.exec(line);
  if (labelTs && isSpeakerLabel(labelTs[1]!)) {
    const start = parseTimecode(labelTs[2]!);
    if (start !== null) {
      return { kind: 'text', start, speaker: labelTs[1]!.trim(), text: labelTs[3]!, bare: false };
    }
  }
  const bracketed = BRACKETED_TS.exec(line);
  if (bracketed) {
    const start = parseTimecode(bracketed[1]!);
    if (start !== null) {
      return { kind: 'text', start, text: line.slice(bracketed[0].length), bare: false };
    }
  }
  const bare = BARE_TS.exec(line);
  if (bare) {
    const start = parseTimecode(bare[1]!);
    if (start !== null)
      return { kind: 'text', start, text: line.slice(bare[0].length), bare: true };
  }
  return { kind: 'text', text: line, bare: false };
}

interface Draft {
  start?: number;
  speaker?: string;
  text: string;
}

export function parseTxt(input: string): TranscriptSegment[] {
  let lines = input.split('\n').map(analyze);
  const textLines = lines.filter((l) => l.kind === 'text');
  const nonBlank = lines.filter((l) => l.kind !== 'blank').length;

  // A bare leading time ("10:30 we agreed") only counts when most lines start with one, and a
  // trailing time ("we meet at 10:30") is a header only when headers recur through the file.
  const bareCount = textLines.filter((l) => l.bare).length;
  const headerCount = lines.filter((l) => l.kind === 'header').length;
  const keepBare = bareCount >= nonBlank / 2;
  const keepHeaders = headerCount >= 2 && headerCount >= nonBlank / 4;
  const raw = input.split('\n');
  lines = lines.map((l, i): Line => {
    if ((l.kind === 'text' && l.bare && !keepBare) || (l.kind === 'header' && !keepHeaders)) {
      return { kind: 'text', text: raw[i]!.trim(), bare: false };
    }
    return l;
  });

  const unlabeled = lines.filter(
    (l): l is Extract<Line, { kind: 'text' }> => l.kind === 'text' && l.speaker === undefined,
  );
  const speakerMode = hasSpeakerPrefixes(unlabeled.map((l) => l.text));
  const structured =
    speakerMode ||
    lines.some((l) => l.kind === 'header' || (l.kind === 'text' && l.start !== undefined));

  const drafts: Draft[] = [];
  for (const l of lines) {
    if (l.kind === 'blank') continue;
    if (l.kind === 'header') {
      drafts.push({ start: l.start, speaker: l.speaker, text: '' });
      continue;
    }
    let { speaker, text } = l;
    if (speaker === undefined && speakerMode) {
      const p = splitSpeakerPrefix(text);
      if (p) ({ speaker, text } = p);
    }
    const startsTurn = l.start !== undefined || speaker !== undefined;
    const current = drafts[drafts.length - 1];
    if (!startsTurn && structured && current) {
      current.text = current.text ? `${current.text} ${text}` : text;
      continue;
    }
    const draft: Draft = { text };
    if (l.start !== undefined) draft.start = l.start;
    if (speaker !== undefined) draft.speaker = speaker;
    drafts.push(draft);
  }

  const timed = drafts.some((d) => d.start !== undefined);
  let last = 0;
  for (const d of drafts) {
    if (d.start === undefined) d.start = timed ? last : 0;
    last = d.start;
  }
  return drafts.map((d, i) => {
    const start = d.start ?? 0;
    let end = 0;
    if (timed) {
      const next = drafts.slice(i + 1).find((n) => (n.start ?? 0) > start);
      end = next ? next.start! : start + estimateDuration(d.text);
    }
    const seg: TranscriptSegment = { start, end, text: d.text };
    if (d.speaker) seg.speaker = d.speaker;
    return seg;
  });
}
