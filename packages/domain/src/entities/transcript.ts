/** A timed piece of a transcript. Times are seconds from the start of the call. */
export interface TranscriptSegment {
  start: number;
  end: number;
  speaker?: string;
  text: string;
}

/** Plaintext held in `transcriptCt` (spec 5). Only ever exists on a device or in transit to a provider. */
export interface Transcript {
  segments: TranscriptSegment[];
  text: string;
}

export type CallDirection = 'in' | 'out' | 'unknown';

/** Plaintext held in `metaCt` (spec 5). */
export interface CallMeta {
  phoneE164: string | null;
  contactName: string | null;
  direction: CallDirection;
  /** Exact ISO timestamp. */
  startedAt: string | null;
  durationSec: number | null;
  title: string | null;
  notes: string | null;
  sourceFileName: string | null;
  language: string | null;
  signature: { deviceKeyId: string; signature: string } | null;
  segmentsFormat: string | null;
}
