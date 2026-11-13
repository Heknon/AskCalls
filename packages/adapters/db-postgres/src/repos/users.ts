import {
  DomainError,
  LIMIT_FIELDS,
  type LimitOverrides,
  type User,
  type UserRepository,
} from '@askcalls/domain';
import { and, desc, eq, ilike, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { Driver } from '../driver';
import { accounts, users, verificationTokens } from '../schema';
import { healthCheck } from './health';

type UserRow = typeof users.$inferSelect;

/** Keeps the known fields with whole-number values; anything else in the column is ignored. */
function overridesFrom(raw: Record<string, unknown>): LimitOverrides {
  const out: LimitOverrides = {};
  for (const f of LIMIT_FIELDS) {
    const v = raw[f];
    if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) out[f] = v;
  }
  return out;
}

/** `%` and `_` are literal in an email search. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  image: r.image,
  plan: r.plan,
  role: r.role,
  locale: r.locale,
  telemetryConsent: {
    productEvents: r.telemetryConsent.productEvents === true,
    errorReports: r.telemetryConsent.errorReports === true,
  },
  retentionDays: r.retentionDays,
  limitOverrides: overridesFrom(r.limitOverrides),
  createdAt: r.createdAt,
  deletedAt: r.deletedAt,
});

/**
 * Users and Auth.js accounts. Lookups that run before anyone is signed in (by email, by
 * account, verification tokens) and cross-user jobs use the system path; everything addressed
 * by a user id runs as that user under RLS.
 */
export function createUserRepository(d: Driver): UserRepository {
  return {
    healthCheck: () => healthCheck(d),

    create: async (u) => {
      const row = {
        id: uuidv7(),
        email: u.email,
        name: u.name ?? null,
        image: u.image ?? null,
        plan: 'free' as const,
        role: 'user' as const,
        locale: null,
        telemetryConsent: { productEvents: false, errorReports: false },
        retentionDays: null,
        limitOverrides: {},
        createdAt: new Date(),
        deletedAt: null,
      };
      const inserted = await d.asUser(row.id, (tx) =>
        tx.insert(users).values(row).onConflictDoNothing().returning(),
      );
      if (!inserted[0]) throw new DomainError('conflict', 'email already registered');
      return toUser(inserted[0]);
    },

    findById: async (id) => {
      const [r] = await d.asUser(id, (tx) => tx.select().from(users).where(eq(users.id, id)));
      return r ? toUser(r) : null;
    },

    findByEmail: async (email) => {
      const [r] = await d.asSystem((db) =>
        db.select().from(users).where(eq(users.email, email)).limit(1),
      );
      return r ? toUser(r) : null;
    },

    update: async (id, patch) => {
      const set: Partial<UserRow> = {};
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.image !== undefined) set.image = patch.image;
      if (patch.locale !== undefined) set.locale = patch.locale;
      if (patch.telemetryConsent !== undefined) {
        set.telemetryConsent = {
          productEvents: patch.telemetryConsent.productEvents,
          errorReports: patch.telemetryConsent.errorReports,
        };
      }
      if (patch.retentionDays !== undefined) set.retentionDays = patch.retentionDays;
      const [r] = await d.asUser(id, (tx) =>
        Object.keys(set).length
          ? tx.update(users).set(set).where(eq(users.id, id)).returning()
          : tx.select().from(users).where(eq(users.id, id)),
      );
      if (!r) throw new DomainError('not_found', 'user not found');
      return toUser(r);
    },

    setPlan: async (id, plan) => {
      await d.asUser(id, (tx) => tx.update(users).set({ plan }).where(eq(users.id, id)));
    },

    setRole: async (id, role) => {
      await d.asUser(id, (tx) => tx.update(users).set({ role }).where(eq(users.id, id)));
    },

    setLimitOverrides: async (id, overrides) => {
      const value = overridesFrom(overrides);
      await d.asUser(id, (tx) =>
        tx.update(users).set({ limitOverrides: value }).where(eq(users.id, id)),
      );
    },

    list: async ({ email, cursor, limit }) => {
      const rs = await d.asSystem((db) =>
        db
          .select()
          .from(users)
          .where(
            and(
              isNull(users.deletedAt),
              email ? ilike(users.email, `%${likeEscape(email)}%`) : undefined,
              cursor ? lt(users.id, cursor) : undefined,
            ),
          )
          .orderBy(desc(users.id))
          .limit(limit + 1),
      );
      const items = rs.slice(0, limit).map(toUser);
      return { items, nextCursor: rs.length > limit ? items[items.length - 1]!.id : null };
    },

    count: async () => {
      const [r] = await d.asSystem((db) =>
        db.select({ n: sql<number>`count(*)::int` }).from(users),
      );
      return Number(r?.n ?? 0);
    },

    listWithRetention: async () => {
      const rs = await d.asSystem((db) =>
        db
          .select({ id: users.id, retentionDays: users.retentionDays })
          .from(users)
          .where(isNotNull(users.retentionDays))
          .orderBy(users.id),
      );
      return rs.map((r) => ({ id: r.id, retentionDays: r.retentionDays! }));
    },

    deleteHard: async (id) => {
      // Every user-owned table references User with ON DELETE CASCADE.
      await d.asUser(id, (tx) => tx.delete(users).where(eq(users.id, id)));
    },

    findByAccount: async (provider, providerAccountId) => {
      const [r] = await d.asSystem((db) =>
        db
          .select({ user: users })
          .from(accounts)
          .innerJoin(users, eq(users.id, accounts.userId))
          .where(
            and(eq(accounts.provider, provider), eq(accounts.providerAccountId, providerAccountId)),
          ),
      );
      return r ? toUser(r.user) : null;
    },

    linkAccount: async (account) => {
      const inserted = await d.asUser(account.userId, (tx) =>
        tx
          .insert(accounts)
          .values({
            userId: account.userId,
            type: account.type,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          })
          .onConflictDoNothing()
          .returning({ provider: accounts.provider }),
      );
      if (!inserted.length) throw new DomainError('conflict', 'account already linked');
    },

    unlinkAccount: async (userId, provider, providerAccountId) => {
      await d.asUser(userId, (tx) =>
        tx
          .delete(accounts)
          .where(
            and(
              eq(accounts.userId, userId),
              eq(accounts.provider, provider),
              eq(accounts.providerAccountId, providerAccountId),
            ),
          ),
      );
    },

    listAccounts: async (userId) => {
      const rs = await d.asUser(userId, (tx) =>
        tx
          .select()
          .from(accounts)
          .where(eq(accounts.userId, userId))
          .orderBy(accounts.provider, accounts.providerAccountId),
      );
      return rs.map((r) => ({ ...r }));
    },

    createVerificationToken: async (t) => {
      await d.asSystem((db) =>
        db
          .insert(verificationTokens)
          .values({ identifier: t.identifier, token: t.token, expires: t.expires })
          .onConflictDoUpdate({
            target: [verificationTokens.identifier, verificationTokens.token],
            set: { expires: t.expires },
          }),
      );
    },

    useVerificationToken: async (identifier, token) => {
      const [r] = await d.asSystem((db) =>
        db
          .delete(verificationTokens)
          .where(
            and(eq(verificationTokens.identifier, identifier), eq(verificationTokens.token, token)),
          )
          .returning(),
      );
      return r ? { identifier: r.identifier, token: r.token, expires: r.expires } : null;
    },
  };
}
