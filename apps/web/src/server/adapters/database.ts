import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { MemoryDb, MemoryRateLimiter } from '@askcalls/adapter-mocks';
import type {
  ApiTokenRepository,
  AuditLog,
  CallRepository,
  InboxRepository,
  KeyringRepository,
  RateLimiter,
  SearchIndex,
  UserDataStore,
  UserRepository,
  VocabularyStore,
} from '@askcalls/domain';
import type { InstanceConfig } from '../config/schema';
import { AdapterUnavailableError } from './errors';

export interface DatabasePorts {
  users: UserRepository;
  keyring: KeyringRepository;
  calls: CallRepository;
  search: SearchIndex;
  vocab: VocabularyStore;
  userData: UserDataStore;
  inbox: InboxRepository;
  apiTokens: ApiTokenRepository;
  audit: AuditLog;
  rateLimiter: RateLimiter;
  close(): Promise<void>;
}

/** `~` and `~/…` → the user's home directory; relative paths resolve against the cwd. */
export function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return resolve(path);
}

/** DB_DRIVER → adapter. */
export async function buildDatabase(config: InstanceConfig): Promise<DatabasePorts> {
  switch (config.db.driver) {
    case 'memory': {
      const db = new MemoryDb();
      return {
        users: db.userRepo,
        keyring: db.keyringRepo,
        calls: db.callRepo,
        search: db.searchIndex,
        vocab: db.vocabStore,
        userData: db.userDataStore,
        inbox: db.inboxRepo,
        apiTokens: db.tokenRepo,
        audit: db.auditLog,
        rateLimiter: new MemoryRateLimiter(),
        close: async () => {},
      };
    }
    case 'postgres': {
      if (!config.db.url) throw new Error('db.url is required when db.driver is postgres');
      // Loaded lazily so the drivers and PGlite's WebAssembly load only when used.
      const { createPostgresDatabase } = await import('@askcalls/adapter-db-postgres');
      // Hosted deployments migrate before the new code goes live (spec 14.1), not on boot.
      const { migrate: _migrate, ...ports } = await createPostgresDatabase({
        driver: 'pg',
        url: config.db.url,
      });
      return ports;
    }
    case 'pglite': {
      const { createPostgresDatabase } = await import('@askcalls/adapter-db-postgres');
      const db = await createPostgresDatabase({
        driver: 'pglite',
        dataDir: expandHome(config.db.pgliteDir),
      });
      // Local mode has no deploy pipeline: the embedded database migrates itself on boot.
      try {
        await db.migrate();
      } catch (e) {
        await db.close();
        throw e;
      }
      const { migrate: _migrate, ...ports } = db;
      return ports;
    }
    default:
      throw new AdapterUnavailableError('database', config.db.driver);
  }
}
