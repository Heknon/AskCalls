import { sql } from 'drizzle-orm';
import { type Driver, openDriver, type PostgresDatabaseConfig } from './driver';
import { buildPostgresDatabase, type PostgresDatabase } from './index';
import { runMigrations } from './migrate';

/** Test-only helpers: a migrated database and a fast reset between tests. */
export interface TestDatabase {
  driver: Driver;
  db: PostgresDatabase;
  /** Empties every table (migrations stay applied). */
  reset(): Promise<void>;
  twoUsers(): Promise<{ userA: string; userB: string }>;
}

export async function openTestDatabase(config: PostgresDatabaseConfig): Promise<TestDatabase> {
  const driver = await openDriver(config);
  await runMigrations(driver);
  const db = buildPostgresDatabase(driver);
  return {
    driver,
    db,
    reset: async () => {
      await driver.asSystem((q) =>
        q.execute(sql`TRUNCATE "User", "VerificationToken", "RateBucket" CASCADE`),
      );
    },
    twoUsers: async () => {
      const a = await db.users.create({ email: 'a@example.test' });
      const b = await db.users.create({ email: 'b@example.test' });
      return { userA: a.id, userB: b.id };
    },
  };
}
