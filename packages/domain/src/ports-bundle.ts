import type { Limits } from './limits';
import type { BlobStore } from './ports/blob-store';
import type {
  BillingProvider,
  Clock,
  IdGenerator,
  RateLimiter,
  Scheduler,
  Telemetry,
} from './ports/infra';
import type { LlmProvider, TranscriptionProvider } from './ports/providers';
import type {
  ApiTokenRepository,
  AuditLog,
  CallRepository,
  InboxRepository,
  KeyringRepository,
  LocalCredentialRepository,
  UserDataStore,
  UserRepository,
  VocabularyStore,
} from './ports/repositories';
import type { SearchIndex } from './ports/search-index';

/** Everything a use case can depend on. Built by the composition root. */
export interface Ports {
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
  blobs: BlobStore;
  /** Null when transcription is Off. */
  transcription: TranscriptionProvider | null;
  /** Null when the LLM is Off. */
  llm: LlmProvider | null;
  rateLimiter: RateLimiter;
  telemetry: Telemetry;
  billing: BillingProvider;
  scheduler: Scheduler;
  clock: Clock;
  ids: IdGenerator;
  limits: Limits;
}
