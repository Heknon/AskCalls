/**
 * 0003: when each `RateBucket` row stops mattering, so the daily job can delete it. Sliding
 * windows expire once they can no longer be the previous window; quota counters when their
 * period ends. Rows written before this migration have no value and are aged out by
 * `windowStart` instead.
 */
export const sql = /* sql */ `
ALTER TABLE "RateBucket" ADD COLUMN "expiresAt" timestamptz;
CREATE INDEX "RateBucket_expiresAt_idx" ON "RateBucket" ("expiresAt");
`;
