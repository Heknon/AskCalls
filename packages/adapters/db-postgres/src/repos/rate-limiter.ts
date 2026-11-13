import { DomainError, type RateLimiter } from '@askcalls/domain';
import { sql } from 'drizzle-orm';
import { toNumber } from '../codec';
import { type Driver, rows } from '../driver';
import { healthCheck } from './health';

/**
 * Sliding-window limiter over `RateBucket` (spec 3.2). Each key has fixed windows of
 * `windowMs`; a hit is weighed against `previous × (1 − elapsed fraction) + current`, the usual
 * two-bucket approximation of a true sliding window. Denied hits are not counted. Keys are not
 * user-owned (they may be IPs or token ids), so this runs on the system path; the row lock on
 * the current bucket serializes concurrent hits on one key.
 */
export function createRateLimiter(d: Driver, now: () => Date = () => new Date()): RateLimiter {
  return {
    healthCheck: () => healthCheck(d),

    hit: async (key, limit, windowMs) => {
      if (!key || !Number.isInteger(limit) || limit < 0 || !(windowMs > 0)) {
        throw new DomainError('invalid', 'invalid rate limit');
      }
      const t = now().getTime();
      const start = Math.floor(t / windowMs) * windowMs;
      const ws = new Date(start).toISOString();
      const prevWs = new Date(start - windowMs).toISOString();
      const weight = 1 - (t - start) / windowMs;
      const resetAt = new Date(start + windowMs);

      return d.asSystemTx(async (tx) => {
        await tx.execute(
          sql`DELETE FROM "RateBucket" WHERE "key" = ${key} AND "windowStart" < ${prevWs}::timestamptz`,
        );
        await tx.execute(
          sql`INSERT INTO "RateBucket" ("key", "windowStart", "count")
              VALUES (${key}, ${ws}::timestamptz, 0) ON CONFLICT DO NOTHING`,
        );
        const [r] = await rows<{ cur: unknown; prev: unknown }>(
          tx,
          sql`SELECT cur."count" AS "cur",
                (SELECT coalesce(max(p."count"), 0) FROM "RateBucket" p
                  WHERE p."key" = ${key} AND p."windowStart" = ${prevWs}::timestamptz) AS "prev"
              FROM "RateBucket" cur
              WHERE cur."key" = ${key} AND cur."windowStart" = ${ws}::timestamptz
              FOR UPDATE`,
        );
        const used = toNumber(r?.prev ?? 0) * weight + toNumber(r?.cur ?? 0);
        const allowed = used + 1 <= limit;
        if (allowed) {
          await tx.execute(
            sql`UPDATE "RateBucket" SET "count" = "count" + 1
                WHERE "key" = ${key} AND "windowStart" = ${ws}::timestamptz`,
          );
        }
        const remaining = Math.max(0, Math.floor(limit - used - (allowed ? 1 : 0)));
        return { allowed, remaining, resetAt };
      });
    },
  };
}
