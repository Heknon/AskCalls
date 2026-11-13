/** A timed piece of a transcript. Times are seconds from the start of the call. */
export interface TranscriptSegment {
  start: number;
  end: number;
  speaker?: string;
  text: string;
}

/** Every call is stored in both of these (owner decision, translation milestone). */
export const TRANSLATION_LANGUAGES = ['en', 'he'] as const;
export type TranslationLanguage = (typeof TRANSLATION_LANGUAGES)[number];

export const isTranslationLanguage = (v: string): v is TranslationLanguage =>
  (TRANSLATION_LANGUAGES as readonly string[]).includes(v);

/**
 * A machine translation of the whole transcript, aligned with the original: the same number of
 * segments with the same start, end and speaker, only `text` translated.
 */
export interface TranscriptTranslation {
  segments: TranscriptSegment[];
  text: string;
  /** LlmProvider id and model that translated it. */
  provider: string;
  model: string;
  /** ISO timestamp. */
  createdAt: string;
}

/** Plaintext held in `transcriptCt` (spec 5). Only ever exists on a device or in transit to a provider. */
export interface Transcript {
  segments: TranscriptSegment[];
  text: string;
  /** English and Hebrew versions of a call in another language; never the original's own language. */
  translations?: Partial<Record<TranslationLanguage, TranscriptTranslation>>;
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
  /** ISO 639-1 code of the original transcript (`normalizeLanguage`), or null when unknown. */
  language: string | null;
  signature: { deviceKeyId: string; signature: string } | null;
  segmentsFormat: string | null;
  /**
   * Languages `transcriptCt` holds translations for, so the calls list can tell which calls
   * still need one without decrypting transcripts. Absent on calls stored before translations.
   */
  translatedTo?: TranslationLanguage[];
}
