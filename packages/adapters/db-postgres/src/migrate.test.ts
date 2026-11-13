import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { openDriver, rows } from './driver';
import { createPostgresDatabase } from './index';
import { runMigrations } from './migrate';
import { MIGRATIONS } from './migrations/index';

describe('migrations on pglite', () => {
  it('applies once and is idempotent', async () => {
    const driver = await openDriver({ driver: 'pglite' });
    try {
      const first = await runMigrations(driver);
      expect(first.applied).toEqual(MIGRATIONS.map((m) => m.id));
      const second = await runMigrations(driver);
      expect(second).toEqual({ applied: [], alreadyApplied: MIGRATIONS.map((m) => m.id) });
    } finally {
      await driver.close();
    }
  });

  it('refuses an edited migration and a migration this build does not know', async () => {
    const driver = await openDriver({ driver: 'pglite' });
    try {
      await runMigrations(driver);
      const edited = MIGRATIONS.map((m) => ({ ...m, sql: `${m.sql}\n-- edited` }));
      await expect(runMigrations(driver, edited)).rejects.toMatchObject({ code: 'conflict' });
      await expect(runMigrations(driver, [])).rejects.toMatchObject({ code: 'conflict' });
    } finally {
      await driver.close();
    }
  });

  it('rolls back a failing migration as a whole', async () => {
    const driver = await openDriver({ driver: 'pglite' });
    try {
      await runMigrations(driver);
      const broken = [
        ...MIGRATIONS,
        { id: '9999_broken', sql: 'CREATE TABLE "Tmp" (x int); SELECT nope_not_a_function();' },
      ];
      await expect(runMigrations(driver, broken)).rejects.toThrow();
      expect((await runMigrations(driver)).applied).toEqual([]);
      const tmp = await rows(driver.db, sql`SELECT 1 FROM pg_tables WHERE tablename = 'Tmp'`);
      expect(tmp).toHaveLength(0);
    } finally {
      await driver.close();
    }
  });

  it('persists a pglite data directory across restarts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'askcalls-pglite-'));
    try {
      const first = await createPostgresDatabase({ driver: 'pglite', dataDir: join(dir, 'db') });
      await first.migrate();
      const u = await first.users.create({ email: 'persist@example.test' });
      await first.close();
      const second = await createPostgresDatabase({ driver: 'pglite', dataDir: join(dir, 'db') });
      expect((await second.migrate()).applied).toEqual([]);
      expect((await second.users.findById(u.id))?.email).toBe('persist@example.test');
      expect((await second.users.healthCheck()).ok).toBe(true);
      await second.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
