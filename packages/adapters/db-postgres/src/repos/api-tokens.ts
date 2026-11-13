import { type ApiToken, type ApiTokenRepository, DomainError } from '@askcalls/domain';
import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { toNumber } from '../codec';
import { type Driver, rows } from '../driver';
import { apiTokens } from '../schema';
import { healthCheck } from './health';

const publicColumns = {
  id: apiTokens.id,
  userId: apiTokens.userId,
  name: apiTokens.name,
  tokenHash: apiTokens.tokenHash,
  scopes: apiTokens.scopes,
  createdAt: apiTokens.createdAt,
  lastUsedAt: apiTokens.lastUsedAt,
  expiresAt: apiTokens.expiresAt,
  revokedAt: apiTokens.revokedAt,
};

const toToken = (r: ApiToken): ApiToken => ({ ...r, scopes: [...r.scopes] });

/**
 * Personal access tokens. `findByHash` authenticates a request before any user is known, and
 * `touch` / `incrementFetches` are keyed by token id (the port has no userId), so those three
 * use the system path.
 */
export function createApiTokenRepository(d: Driver): ApiTokenRepository {
  return {
    healthCheck: () => healthCheck(d),

    create: async (t) => {
      const [r] = await d.asUser(t.userId, (tx) =>
        tx
          .insert(apiTokens)
          .values({
            id: t.id,
            userId: t.userId,
            name: t.name,
            tokenHash: t.tokenHash,
            scopes: [...t.scopes],
            createdAt: new Date(),
            lastUsedAt: null,
            expiresAt: t.expiresAt,
            revokedAt: null,
            fetchesThisHour: 0,
            hourWindowStart: null,
          })
          .returning(publicColumns),
      );
      return toToken(r!);
    },

    findByHash: async (tokenHash) => {
      const [r] = await d.asSystem((db) =>
        db.select(publicColumns).from(apiTokens).where(eq(apiTokens.tokenHash, tokenHash)),
      );
      return r ? toToken(r) : null;
    },

    list: async (userId) => {
      const rs = await d.asUser(userId, (tx) =>
        tx
          .select(publicColumns)
          .from(apiTokens)
          .where(eq(apiTokens.userId, userId))
          .orderBy(asc(apiTokens.createdAt), asc(apiTokens.id)),
      );
      return rs.map(toToken);
    },

    revoke: async (userId, id, at) => {
      await d.asUser(userId, (tx) =>
        tx
          .update(apiTokens)
          .set({ revokedAt: at })
          .where(
            and(eq(apiTokens.userId, userId), eq(apiTokens.id, id), isNull(apiTokens.revokedAt)),
          ),
      );
    },

    touch: async (id, at) => {
      await d.asSystem((db) =>
        db.update(apiTokens).set({ lastUsedAt: at }).where(eq(apiTokens.id, id)),
      );
    },

    countActive: async (userId, now) => {
      const [r] = await d.asUser(userId, (tx) =>
        tx
          .select({ n: sql<number>`count(*)::int` })
          .from(apiTokens)
          .where(
            and(
              eq(apiTokens.userId, userId),
              isNull(apiTokens.revokedAt),
              or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, now)),
            ),
          ),
      );
      return Number(r?.n ?? 0);
    },

    incrementFetches: async (id, now) => {
      // One atomic statement: reset the window when it started an hour or more before `now`.
      const [r] = await d.asSystem((db) =>
        rows<{ n: unknown }>(
          db,
          sql`UPDATE "ApiToken" SET
                "fetchesThisHour" = CASE
                  WHEN "hourWindowStart" IS NULL
                    OR "hourWindowStart" <= ${now.toISOString()}::timestamptz - interval '1 hour'
                  THEN 1 ELSE "fetchesThisHour" + 1 END,
                "hourWindowStart" = CASE
                  WHEN "hourWindowStart" IS NULL
                    OR "hourWindowStart" <= ${now.toISOString()}::timestamptz - interval '1 hour'
                  THEN ${now.toISOString()}::timestamptz ELSE "hourWindowStart" END
              WHERE "id" = ${id}
              RETURNING "fetchesThisHour" AS "n"`,
        ),
      );
      if (!r) throw new DomainError('not_found', 'token not found');
      return toNumber(r.n);
    },
  };
}
