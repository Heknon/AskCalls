import pg from 'pg';

/**
 * Integration-test Postgres. Uses `ASKCALLS_TEST_PG_URL` (a superuser URL to any Postgres 16+
 * with pgvector) when set, otherwise starts `pgvector/pgvector:pg17` with Testcontainers.
 *
 * Each call creates a fresh database owned by a non-superuser role with CREATEROLE, like the
 * owner role a managed Postgres (Neon) hands out, so migrations and RLS are tested without
 * superuser powers. The vector extension is pre-created by the admin, as a provider would.
 */
export interface ProvisionedPostgres {
  url: string;
  stop(): Promise<void>;
}

const OWNER = 'askcalls_owner';
const OWNER_PASSWORD = 'askcalls_owner';

let container: Promise<{ url: string; stop(): Promise<void> }> | null = null;

async function adminUrl(): Promise<string> {
  const fromEnv = process.env.ASKCALLS_TEST_PG_URL;
  if (fromEnv) return fromEnv;
  container ??= (async () => {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const started = await new PostgreSqlContainer('pgvector/pgvector:pg17').start();
    return { url: started.getConnectionUri(), stop: async () => void (await started.stop()) };
  })();
  return (await container).url;
}

async function withClient<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function provisionPostgres(): Promise<ProvisionedPostgres> {
  const admin = await adminUrl();
  const name = `askcalls_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  await withClient(admin, async (c) => {
    const exists = await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [OWNER]);
    if (!exists.rowCount) {
      await c.query(
        `CREATE ROLE ${OWNER} LOGIN CREATEROLE NOSUPERUSER PASSWORD '${OWNER_PASSWORD}'`,
      );
    }
    await c.query(`CREATE DATABASE ${name} OWNER ${OWNER}`);
  });
  const dbAdmin = new URL(admin);
  dbAdmin.pathname = `/${name}`;
  await withClient(dbAdmin.toString(), async (c) => {
    await c.query('CREATE EXTENSION IF NOT EXISTS vector');
  });
  const owner = new URL(dbAdmin.toString());
  owner.username = OWNER;
  owner.password = OWNER_PASSWORD;
  return {
    url: owner.toString(),
    stop: async () => {
      await withClient(admin, (c) => c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
    },
  };
}
