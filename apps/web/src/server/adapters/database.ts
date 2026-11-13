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

/** DB_DRIVER → adapter. The Postgres package registers `postgres` and `pglite` here. */
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
    default:
      throw new AdapterUnavailableError('database', config.db.driver);
  }
}
