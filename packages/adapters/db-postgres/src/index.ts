import type {
  ApiTokenRepository,
  AuditLog,
  CallRepository,
  InboxRepository,
  KeyringRepository,
  LocalCredentialRepository,
  RateLimiter,
  SearchIndex,
  UserDataStore,
  UserRepository,
  VocabularyStore,
} from '@askcalls/domain';
import { sql } from 'drizzle-orm';
import { type Driver, openDriver, type PostgresDatabaseConfig, rows } from './driver';
import { type MigrationResult, runMigrations } from './migrate';
import { createApiTokenRepository } from './repos/api-tokens';
import { createAuditLog } from './repos/audit';
import { createCallRepository } from './repos/calls';
import { createInboxRepository } from './repos/inbox';
import { createKeyringRepository } from './repos/keyring';
import { createLocalCredentialRepository } from './repos/local-credentials';
import { createRateLimiter } from './repos/rate-limiter';
import { createSearchIndex } from './repos/search';
import { createUserDataStore } from './repos/user-data';
import { createUserRepository } from './repos/users';
import { createVocabularyStore } from './repos/vocab';

export type { PostgresDatabaseConfig } from './driver';
export type { MigrationResult } from './migrate';

export interface PostgresDatabase {
  users: UserRepository;
  keyring: KeyringRepository;
  calls: CallRepository;
  search: SearchIndex;
  vocab: VocabularyStore;
  userData: UserDataStore;
  inbox: InboxRepository;
  apiTokens: ApiTokenRepository;
  localCredentials: LocalCredentialRepository;
  audit: AuditLog;
  rateLimiter: RateLimiter;
  /** Applies pending committed migrations. Idempotent and safe to run concurrently. */
  migrate(): Promise<MigrationResult>;
  /** Server and pgvector versions, for the setup wizard's connection test. */
  serverInfo(): Promise<ServerInfo>;
  close(): Promise<void>;
}

export interface ServerInfo {
  version: string;
  /** Installed pgvector version, or null. */
  vector: string | null;
  /** pgvector can be installed with CREATE EXTENSION. */
  vectorAvailable: boolean;
}

async function serverInfo(driver: Driver): Promise<ServerInfo> {
  const [r] = await driver.asSystem((db) =>
    rows<{ version: string; vector: string | null; available: boolean }>(
      db,
      sql`SELECT current_setting('server_version') AS version,
            (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS vector,
            EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') AS available`,
    ),
  );
  return {
    version: (r?.version ?? '').split(' ')[0]!,
    vector: r?.vector ?? null,
    vectorAvailable: r?.available === true,
  };
}

export function buildPostgresDatabase(driver: Driver): PostgresDatabase {
  return {
    users: createUserRepository(driver),
    keyring: createKeyringRepository(driver),
    calls: createCallRepository(driver),
    search: createSearchIndex(driver),
    vocab: createVocabularyStore(driver),
    userData: createUserDataStore(driver),
    inbox: createInboxRepository(driver),
    apiTokens: createApiTokenRepository(driver),
    localCredentials: createLocalCredentialRepository(driver),
    audit: createAuditLog(driver),
    rateLimiter: createRateLimiter(driver),
    migrate: () => runMigrations(driver),
    serverInfo: () => serverInfo(driver),
    close: () => driver.close(),
  };
}

/**
 * Every Postgres-backed port on one connection pool (`pg`) or one embedded database
 * (`pglite`). Does not migrate: call `migrate()` (local mode does it on boot; hosted
 * deployments migrate before the new code goes live).
 */
export async function createPostgresDatabase(
  config: PostgresDatabaseConfig,
): Promise<PostgresDatabase> {
  return buildPostgresDatabase(await openDriver(config));
}
