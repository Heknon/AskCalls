/**
 * Applies pending migrations to a server Postgres: CI, deploy pipelines and Docker boot.
 *
 *   DATABASE_URL=postgres://… bun run --cwd packages/adapters/db-postgres migrate
 *
 * The URL comes from the environment, never argv, so it stays out of process listings. Output
 * is migration ids only.
 */
import { createPostgresDatabase } from './index';

const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write('DATABASE_URL is not set\n');
  process.exit(2);
}

const db = await createPostgresDatabase({ driver: 'pg', url, poolMax: 1 });
try {
  const { applied, alreadyApplied } = await db.migrate();
  process.stdout.write(
    applied.length
      ? `applied ${applied.join(', ')} (${alreadyApplied.length} already applied)\n`
      : `up to date (${alreadyApplied.length} applied)\n`,
  );
} catch (e) {
  // Schema errors name objects, not row data; `detail` (which can hold values) is not printed.
  const { code, message, details } = e as { code?: unknown; message?: unknown; details?: unknown };
  process.stderr.write(
    `migration failed: ${String(message)}${typeof code === 'string' ? ` [${code}]` : ''}${details ? ` ${JSON.stringify(details)}` : ''}\n`,
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
