import type { NewCall } from '@askcalls/domain';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { APP_ROLE, rows } from './driver';
import type { TestDatabase } from './test-support';

const USER_TABLES = [
  'Account',
  'Keyring',
  'UserKeys',
  'DeviceKey',
  'DeviceLinkSession',
  'Call',
  'CallChunk',
  'VocabDelta',
  'UserData',
  'InboxItem',
  'ApiToken',
  'AuditEvent',
];

let seq = 0;
function makeCall(userId: string): NewCall {
  seq += 1;
  const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  return {
    id: `rls-${Date.now()}-${seq}`,
    userId,
    status: 'ready',
    source: 'app',
    day: 20_000,
    durationBucket: 1,
    wrappedDek: rand(60),
    transcriptCt: rand(100),
    metaCt: rand(80),
    contactTok: null,
    keywordToks: [BigInt(seq)],
    tagToks: [],
    audioTok: null,
    contentTok: BigInt(seq),
    recording: null,
  };
}

/** Row-level security: the second line of defense behind the explicit userId filters. */
export function describeRowLevelSecurity(name: string, open: () => Promise<TestDatabase>) {
  describe(`row-level security: ${name}`, () => {
    let t: TestDatabase;
    let userA: string;
    let userB: string;
    beforeAll(async () => {
      t = await open();
    });
    afterAll(async () => {
      await t.db.close();
    });
    beforeEach(async () => {
      await t.reset();
      ({ userA, userB } = await t.twoUsers());
      await t.db.calls.create(makeCall(userA));
      await t.db.calls.create(makeCall(userB));
      await t.db.audit.append({
        userId: userA,
        actor: 'session',
        action: 'call.create',
        callId: null,
        meta: {},
      });
    });

    /** A raw transaction as the app role, optionally with app.user_id set. */
    const asAppRole = <T>(userId: string | null, query: ReturnType<typeof sql>) =>
      t.driver.asSystemTx(async (tx) => {
        await tx.execute(sql`SELECT set_config('role', ${APP_ROLE}, true)`);
        if (userId !== null) {
          await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
        }
        return rows<T>(tx, query);
      });

    it('enables RLS with a policy on every user-owned table', async () => {
      const rs = await rows<{ relname: string; relrowsecurity: boolean; policies: number }>(
        t.driver.db,
        sql`SELECT c.relname, c.relrowsecurity,
              (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'`,
      );
      const byName = new Map(rs.map((r) => [r.relname, r]));
      for (const table of [...USER_TABLES, 'User']) {
        expect(byName.get(table), table).toMatchObject({ relrowsecurity: true, policies: 1 });
      }
    });

    it('a raw query without app.user_id returns nothing', async () => {
      for (const table of [...USER_TABLES, 'User']) {
        const [r] = await asAppRole<{ n: number }>(
          null,
          sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}`,
        );
        expect(r?.n, table).toBe(0);
      }
      // The bypass path (table owner) still sees everything.
      const [all] = await rows<{ n: number }>(
        t.driver.db,
        sql`SELECT count(*)::int AS n FROM "Call"`,
      );
      expect(all?.n).toBe(2);
    });

    it("a query as one user sees only that user's rows, even without a userId filter", async () => {
      const own = await asAppRole<{ userId: string }>(userA, sql`SELECT "userId" FROM "Call"`);
      expect(own).toEqual([{ userId: userA }]);
      const users = await asAppRole<{ id: string }>(userA, sql`SELECT "id" FROM "User"`);
      expect(users).toEqual([{ id: userA }]);
      const audit = await asAppRole<{ n: number }>(
        userB,
        sql`SELECT count(*)::int AS n FROM "AuditEvent"`,
      );
      expect(audit[0]?.n).toBe(0);
    });

    it("cannot write another user's rows", async () => {
      await expect(
        asAppRole(
          userA,
          sql`INSERT INTO "AuditEvent" ("id", "userId", "at", "actor", "action")
              VALUES ('x', ${userB}, now(), 'session', 'call.read') RETURNING "id"`,
        ),
      ).rejects.toThrow();
      const updated = await asAppRole<{ id: string }>(
        userA,
        sql`UPDATE "Call" SET "status" = 'failed' WHERE "userId" = ${userB} RETURNING "id"`,
      );
      expect(updated).toEqual([]);
    });

    it('adapter calls run as the app role with app.user_id set', async () => {
      const [r] = await t.driver.asUser(userA, (tx) =>
        rows<{ role: string; uid: string }>(
          tx,
          sql`SELECT current_user AS "role", current_setting('app.user_id', true) AS "uid"`,
        ),
      );
      expect(r).toEqual({ role: APP_ROLE, uid: userA });
      // The setting is transaction-local: it does not leak to the next statement.
      const [after] = await rows<{ role: string; uid: string | null }>(
        t.driver.db,
        sql`SELECT current_user AS "role", nullif(current_setting('app.user_id', true), '') AS "uid"`,
      );
      expect(after?.role).not.toBe(APP_ROLE);
      expect(after?.uid).toBeNull();
    });
  });
}
