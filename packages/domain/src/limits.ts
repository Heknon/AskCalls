/** Free-tier limits (spec 12). `maxCalls` comes from config (FREE_TIER_MAX_CALLS). */
export interface Limits {
  maxCalls: number;
  transcriptionMinutesPerMonth: number;
  recordingBytes: number;
  maxApiTokens: number;
  mcpFetchesPerTokenPerHour: number;
  asksPerDay: number;
  /**
   * Characters of transcript sent for translation through the managed LLM per UTC month. About
   * 900 characters are spoken per minute, so the default covers a translation of every managed
   * minute into both languages several times over, plus imported transcripts and the one-time
   * backfill of existing calls.
   */
  translationCharsPerMonth: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxCalls: 500,
  transcriptionMinutesPerMonth: 300,
  recordingBytes: 2 * 1024 ** 3,
  maxApiTokens: 5,
  mcpFetchesPerTokenPerHour: 60,
  asksPerDay: 50,
  translationCharsPerMonth: 2_000_000,
};
