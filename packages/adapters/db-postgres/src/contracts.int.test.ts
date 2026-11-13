import { describePostgresContracts } from './contract-suites';
import { provisionPostgres } from './int-support';
import { describeRowLevelSecurity } from './rls-suite';
import { openTestDatabase, type TestDatabase } from './test-support';

/** The same suites as contracts.test.ts, on real Postgres through node-postgres. */
async function openPg(): Promise<TestDatabase> {
  const pgServer = await provisionPostgres();
  const t = await openTestDatabase({ driver: 'pg', url: pgServer.url, poolMax: 4 });
  const close = t.db.close;
  t.db.close = async () => {
    await close();
    await pgServer.stop();
  };
  return t;
}

describePostgresContracts('pg', openPg);
describeRowLevelSecurity('pg', openPg);
