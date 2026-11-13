import { DomainError } from '@askcalls/domain';
import type { Driver } from './driver';
import { MIGRATIONS, type Migration } from './migrations/index';

export interface MigrationResult {
  /** Ids applied by this run, in order. */
  applied: string[];
  /** Ids that were already in the database. */
  alreadyApplied: string[];
}

/** Arbitrary constant: serializes concurrent migrators (two containers booting at once). */
const LOCK_KEY = 7_235_508_211;

async function checksum(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Buffer.from(digest).toString('hex');
}

/**
 * Applies pending migrations in one transaction under an advisory lock. Idempotent. Fails
 * (and applies nothing) when an applied migration's SQL changed, or when the database has a
 * migration this build doesn't know: both mean the code and database disagree.
 */
export async function runMigrations(
  driver: Driver,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<MigrationResult> {
  return driver.scriptTx(async (s) => {
    await s.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
    await s.exec(`
      CREATE TABLE IF NOT EXISTS "_Migration" (
        "id" text COLLATE "C" PRIMARY KEY,
        "checksum" text NOT NULL,
        "appliedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    const done = await s.query<{ id: string; checksum: string }>(
      'SELECT "id", "checksum" FROM "_Migration" ORDER BY "id"',
    );
    const known = new Map(migrations.map((m) => [m.id, m]));
    for (const row of done) {
      const m = known.get(row.id);
      if (!m) {
        throw new DomainError('conflict', 'database has a migration this build does not know', {
          migration: row.id,
        });
      }
      if ((await checksum(m.sql)) !== row.checksum) {
        throw new DomainError('conflict', 'an applied migration was edited', {
          migration: row.id,
        });
      }
    }
    const doneIds = new Set(done.map((r) => r.id));
    const applied: string[] = [];
    for (const m of migrations) {
      if (doneIds.has(m.id)) continue;
      await s.exec(m.sql);
      await s.query('INSERT INTO "_Migration" ("id", "checksum") VALUES ($1, $2)', [
        m.id,
        await checksum(m.sql),
      ]);
      applied.push(m.id);
    }
    return { applied, alreadyApplied: [...doneIds] };
  });
}
