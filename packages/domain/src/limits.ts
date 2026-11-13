/** Free-tier limits (spec 12). `maxCalls` comes from config (FREE_TIER_MAX_CALLS). */
export interface Limits {
  maxCalls: number;
  transcriptionMinutesPerMonth: number;
  recordingBytes: number;
  maxApiTokens: number;
  mcpFetchesPerTokenPerHour: number;
  asksPerDay: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxCalls: 500,
  transcriptionMinutesPerMonth: 300,
  recordingBytes: 2 * 1024 ** 3,
  maxApiTokens: 5,
  mcpFetchesPerTokenPerHour: 60,
  asksPerDay: 50,
};
