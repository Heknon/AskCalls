import type { Call, CallListFilter, CallPatch, CallSummary, NewCall } from '../entities/call';
import type { Bytes, CallId, Day, Page, PageRequest, Token, UserId } from '../entities/common';
import type {
  DeviceKey,
  DeviceLinkSession,
  KeyringEntry,
  NewKeyringEntry,
  UserKeys,
} from '../entities/keyring';
import type {
  ApiToken,
  AuditAction,
  AuditEvent,
  InboxItem,
  NewApiToken,
  NewAuditEvent,
  NewInboxItem,
  UserDataBlob,
  UserDataKind,
  VocabDelta,
} from '../entities/other';
import type {
  LinkedAccount,
  NewUser,
  Plan,
  User,
  UserRole,
  VerificationToken,
} from '../entities/user';
import type { HealthCheckable } from './health';

/**
 * Every method that touches user-owned rows takes `userId` first and must scope by it.
 * A row belonging to another user behaves exactly like a missing row.
 */

export interface UserRepository extends HealthCheckable {
  create(user: NewUser): Promise<User>;
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  update(
    id: UserId,
    patch: Partial<Pick<User, 'name' | 'image' | 'locale' | 'telemetryConsent' | 'retentionDays'>>,
  ): Promise<User>;
  setPlan(id: UserId, plan: Plan): Promise<void>;
  setRole(id: UserId, role: UserRole): Promise<void>;
  count(): Promise<number>;
  /** Users with a retention policy, for the daily purge job. */
  listWithRetention(): Promise<Array<{ id: UserId; retentionDays: number }>>;
  /** Crypto-shred: remove the user and every row they own. */
  deleteHard(id: UserId): Promise<void>;

  /** Auth.js account linking. */
  findByAccount(provider: string, providerAccountId: string): Promise<User | null>;
  linkAccount(account: LinkedAccount): Promise<void>;
  unlinkAccount(provider: string, providerAccountId: string): Promise<void>;
  listAccounts(userId: UserId): Promise<LinkedAccount[]>;
  createVerificationToken(token: VerificationToken): Promise<void>;
  /** Returns and deletes the token (single use), or null when missing. */
  useVerificationToken(identifier: string, token: string): Promise<VerificationToken | null>;
}

export interface KeyringRepository extends HealthCheckable {
  list(userId: UserId, opts?: { includeRevoked?: boolean }): Promise<KeyringEntry[]>;
  get(userId: UserId, id: string): Promise<KeyringEntry | null>;
  add(entry: NewKeyringEntry): Promise<KeyringEntry>;
  /** Revoking deletes the wrapped key material; the row stays for the audit trail. */
  revoke(userId: UserId, id: string, at: Date): Promise<void>;
  touch(userId: UserId, id: string, at: Date): Promise<void>;

  getUserKeys(userId: UserId): Promise<UserKeys | null>;
  putUserKeys(keys: UserKeys): Promise<void>;

  listDevices(userId: UserId): Promise<DeviceKey[]>;
  getDevice(userId: UserId, id: string): Promise<DeviceKey | null>;
  addDevice(device: Omit<DeviceKey, 'createdAt' | 'revokedAt'>): Promise<DeviceKey>;
  revokeDevice(userId: UserId, id: string, at: Date): Promise<void>;

  createLinkSession(session: DeviceLinkSession): Promise<void>;
  /** Link sessions are looked up by id alone: the joiner has no session yet. */
  getLinkSession(id: string): Promise<DeviceLinkSession | null>;
  updateLinkSession(
    id: string,
    patch: Partial<
      Pick<DeviceLinkSession, 'state' | 'devicePublicKey' | 'deviceLabel' | 'encryptedRootKey'>
    >,
  ): Promise<void>;
  deleteExpiredLinkSessions(now: Date): Promise<number>;
}

export interface CallRepository extends HealthCheckable {
  /** Throws DomainError('duplicate') on a repeated audioTok or contentTok for the same user. */
  create(call: NewCall): Promise<Call>;
  get(userId: UserId, id: CallId): Promise<Call | null>;
  /** Newest day first, then id descending. */
  list(userId: UserId, filter: CallListFilter, page: PageRequest): Promise<Page<CallSummary>>;
  update(userId: UserId, id: CallId, patch: CallPatch): Promise<Call>;
  /** Deletes the row and its chunks. Returns the deleted call (for blob cleanup) or null. */
  delete(userId: UserId, id: CallId): Promise<Call | null>;
  findIdByAudioTok(userId: UserId, tok: Token): Promise<CallId | null>;
  findIdByContentTok(userId: UserId, tok: Token): Promise<CallId | null>;
  count(userId: UserId): Promise<number>;
  totalRecordingBytes(userId: UserId): Promise<number>;
  /** Calls with `day < beforeDay`, for retention. */
  listIdsBefore(userId: UserId, beforeDay: Day, limit: number): Promise<CallId[]>;
}

export interface VocabularyStore extends HealthCheckable {
  /** Deltas with seq > afterSeq, ascending. */
  listSince(userId: UserId, afterSeq: number): Promise<VocabDelta[]>;
  append(userId: UserId, ct: Bytes): Promise<VocabDelta>;
  /** Atomically replaces every delta with seq <= upToSeq by one compacted delta. */
  compact(userId: UserId, upToSeq: number, ct: Bytes): Promise<VocabDelta>;
  count(userId: UserId): Promise<number>;
}

export interface UserDataStore extends HealthCheckable {
  get(userId: UserId, kind: UserDataKind): Promise<UserDataBlob | null>;
  /**
   * Optimistic concurrency: `expectedVersion` is the version the client read (0 when absent).
   * Throws DomainError('version_conflict') when it doesn't match. Returns the new version.
   */
  put(userId: UserId, kind: UserDataKind, ct: Bytes, expectedVersion: number): Promise<number>;
}

export interface InboxRepository extends HealthCheckable {
  create(item: NewInboxItem): Promise<InboxItem>;
  list(userId: UserId): Promise<InboxItem[]>;
  get(userId: UserId, id: string): Promise<InboxItem | null>;
  delete(userId: UserId, id: string): Promise<InboxItem | null>;
  count(userId: UserId): Promise<number>;
  /** Removes expired items across all users; returns their blob keys for cleanup. */
  deleteExpired(now: Date): Promise<Array<{ userId: UserId; blobKey: string | null }>>;
}

export interface ApiTokenRepository extends HealthCheckable {
  create(token: NewApiToken): Promise<ApiToken>;
  findByHash(tokenHash: Bytes): Promise<ApiToken | null>;
  list(userId: UserId): Promise<ApiToken[]>;
  revoke(userId: UserId, id: string, at: Date): Promise<void>;
  touch(id: string, at: Date): Promise<void>;
  countActive(userId: UserId, now: Date): Promise<number>;
  /**
   * Increments the hourly ciphertext-fetch counter (spec 12), resetting it when the window
   * started more than an hour before `now`. Returns the count after incrementing.
   */
  incrementFetches(id: string, now: Date): Promise<number>;
}

export interface AuditLog extends HealthCheckable {
  append(event: NewAuditEvent): Promise<void>;
  /** Newest first. */
  list(
    userId: UserId,
    page: PageRequest,
    filter?: { action?: AuditAction },
  ): Promise<Page<AuditEvent>>;
}
