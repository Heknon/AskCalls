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

export const LIMIT_FIELDS = [
  'maxCalls',
  'transcriptionMinutesPerMonth',
  'recordingBytes',
  'maxApiTokens',
  'mcpFetchesPerTokenPerHour',
  'asksPerDay',
  'translationCharsPerMonth',
] as const satisfies readonly (keyof Limits)[];

export type LimitField = (typeof LIMIT_FIELDS)[number];

/** Per-account limits an admin set (spec 12). A missing field falls back to the instance limit. */
export type LimitOverrides = Partial<Limits>;

/** Largest value an override may hold: 1 PB in bytes, and a safe integer everywhere. */
export const MAX_LIMIT_VALUE = 1024 ** 5;

export function effectiveLimits(instance: Limits, overrides: LimitOverrides): Limits {
  const out = { ...instance };
  for (const f of LIMIT_FIELDS) {
    const v = overrides[f];
    if (v !== undefined) out[f] = v;
  }
  return out;
}
