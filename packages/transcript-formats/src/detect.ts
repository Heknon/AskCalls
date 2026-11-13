import { detectJsonFormat, type JsonFormat } from './json';
import { SRT_TIMING } from './srt';

export type TranscriptFormat = 'txt' | 'srt' | 'vtt' | JsonFormat;

export const TRANSCRIPT_FORMATS: readonly TranscriptFormat[] = [
  'txt',
  'srt',
  'vtt',
  'whisper-json',
  'deepgram-json',
  'assemblyai-json',
  'elevenlabs-json',
  'segments-json',
];

/** File extensions the importer accepts as transcripts. */
export const TRANSCRIPT_EXTENSIONS: readonly string[] = ['.txt', '.text', '.srt', '.vtt', '.json'];

export function extensionOf(filename: string | null | undefined): string {
  if (!filename) return '';
  const base = filename.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

export interface Detection {
  format: TranscriptFormat;
  /** Parsed JSON, when the content was JSON, so callers don't parse twice. */
  json?: unknown;
}

/**
 * Detects the format from decoded content, using the filename as a tie-breaker. Content wins over
 * the extension (an SRT saved as `.txt` is read as SRT). Returns null for JSON of unknown shape.
 */
export function detectFormat(content: string, filename?: string | null): Detection | null {
  const ext = extensionOf(filename);
  const head = content.trimStart();
  if (/^WEBVTT(\s|$)/.test(head)) return { format: 'vtt' };

  if (head.startsWith('{') || head.startsWith('[')) {
    try {
      const json: unknown = JSON.parse(content);
      const format = detectJsonFormat(json);
      return format ? { format, json } : null;
    } catch {
      if (ext === '.json') return null;
    }
  }

  const lines = head.split('\n', 200);
  const timings = lines.filter((l) => SRT_TIMING.test(l)).length;
  if (timings > 0) {
    if (ext === '.vtt') return { format: 'vtt' };
    return { format: 'srt' };
  }
  if (ext === '.vtt') return { format: 'vtt' };
  if (ext === '.srt') return { format: 'srt' };
  return { format: 'txt' };
}
