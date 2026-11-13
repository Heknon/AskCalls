/** Transcript parsers: TXT, SRT, VTT, JSON (Whisper, Deepgram, AssemblyAI, ElevenLabs, generic segments). */
import { DomainError, type Transcript, type TranscriptSegment } from '@askcalls/domain';
import { decodeText, type TextInput } from './decode';
import { detectFormat, type TranscriptFormat } from './detect';
import { type JsonFormat, parseJson, parseJsonValue } from './json';
import { buildTranscript, isTimed } from './segments';
import { parseSrt } from './srt';
import { parseTxt } from './txt';
import { parseVtt } from './vtt';

export { decodeText, type TextInput } from './decode';
export {
  type Detection,
  detectFormat,
  extensionOf,
  TRANSCRIPT_EXTENSIONS,
  TRANSCRIPT_FORMATS,
  type TranscriptFormat,
} from './detect';
export { type TxtExportOptions, toSrt, toTxt } from './export';
export { detectJsonFormat, type JsonFormat, parseJson, parseJsonValue } from './json';
export { buildTranscript, cleanText, isTimed, normalizeSegments } from './segments';
export { parseSrt } from './srt';
export { formatClock, formatSrtTime, parseTimecode } from './timecode';
export { parseTxt } from './txt';
export { parseVtt } from './vtt';

export interface ParseOptions {
  /** Used as a tie-breaker for detection (`.srt`, `.vtt`, `.json`, `.txt`). */
  filename?: string | null;
  /** Skip detection and parse as this format. */
  format?: TranscriptFormat;
}

export interface ParsedTranscript {
  format: TranscriptFormat;
  transcript: Transcript;
  /** False when the source had no times (plain text): all segments are at 0. */
  timed: boolean;
  /** Language reported by the source (Whisper, Deepgram, AssemblyAI, ElevenLabs), if any. */
  language: string | null;
  /** End of the last segment, or null when untimed. */
  durationSec: number | null;
}

/** Decodes, detects and parses a transcript file. Throws `DomainError('unsupported' | 'invalid')`. */
export function parseTranscript(input: TextInput, opts: ParseOptions = {}): ParsedTranscript {
  const content = decodeText(input);
  if (content.trim() === '') throw new DomainError('invalid', 'Transcript is empty');

  let format = opts.format;
  let json: unknown;
  if (!format) {
    const detection = detectFormat(content, opts.filename);
    if (!detection) throw new DomainError('unsupported', 'Unrecognized transcript format');
    format = detection.format;
    json = detection.json;
  }

  let language: string | null = null;
  let segments: TranscriptSegment[];
  switch (format) {
    case 'txt':
      segments = parseTxt(content);
      break;
    case 'srt':
      segments = parseSrt(content);
      break;
    case 'vtt':
      segments = parseVtt(content);
      break;
    default: {
      const result =
        json !== undefined
          ? parseJsonValue(json, format as JsonFormat)
          : parseJson(content, format as JsonFormat);
      segments = result.segments;
      language = result.language;
    }
  }

  const transcript = buildTranscript(segments);
  if (transcript.segments.length === 0) {
    throw new DomainError('invalid', 'Transcript has no text', { format });
  }
  const timed = isTimed(transcript.segments);
  const durationSec = timed ? Math.max(...transcript.segments.map((s) => s.end)) : null;
  return { format, transcript, timed, language, durationSec };
}
