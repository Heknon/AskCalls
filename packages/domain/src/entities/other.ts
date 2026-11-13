import type { Bytes, CallId, UserId } from './common';

export type UserDataKind = 'tags' | 'contacts' | 'rules' | 'synonyms' | 'settings' | 'providers';
export const USER_DATA_KINDS: readonly UserDataKind[] = [
  'tags',
  'contacts',
  'rules',
  'synonyms',
  'settings',
  'providers',
];

export interface UserDataBlob {
  kind: UserDataKind;
  ct: Bytes;
  version: number;
}

export interface VocabDelta {
  id: string;
  userId: UserId;
  seq: number;
  ct: Bytes;
  compacted: boolean;
  createdAt: Date;
}

export interface InboxItem {
  id: string;
  userId: UserId;
  /** Ephemeral ECDH P-256 public key used for this item (SPKI). */
  ephemeralPublicKey: Bytes;
  /** Inline ciphertext, or null when the payload is in the BlobStore under `blobKey`. */
  payloadCt: Bytes | null;
  blobKey: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export type NewInboxItem = Omit<InboxItem, 'createdAt'>;

export type ApiScope = 'read' | 'write' | 'ask' | 'keys';
export const API_SCOPES: readonly ApiScope[] = ['read', 'write', 'ask', 'keys'];

export interface ApiToken {
  id: string;
  userId: UserId;
  name: string;
  /** sha256 of the full token string. The token itself is shown once and never stored. */
  tokenHash: Bytes;
  scopes: ApiScope[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export type NewApiToken = Omit<ApiToken, 'createdAt' | 'lastUsedAt' | 'revokedAt'>;

/** `session`, `token:<id>`, `agent:<deviceId>`, or `system` for scheduled jobs. */
export type AuditActor = 'session' | 'system' | `token:${string}` | `agent:${string}`;

export type AuditAction =
  | 'call.create'
  | 'call.read'
  | 'call.list'
  | 'call.update'
  | 'call.delete'
  | 'call.search'
  | 'recording.upload'
  | 'recording.read'
  | 'recording.orphaned'
  | 'keyring.add'
  | 'keyring.revoke'
  | 'keyring.read'
  | 'device.link_start'
  | 'device.link'
  | 'device.revoke'
  | 'token.create'
  | 'token.revoke'
  | 'inbox.upload'
  | 'inbox.process'
  | 'inbox.delete'
  | 'keyring.setup'
  | 'ask'
  | 'transcribe'
  | 'export'
  | 'retention.update'
  | 'retention.purge'
  | 'account.delete'
  | 'role.grant'
  | 'instance.update'
  | 'ingest';

export interface AuditEvent {
  id: string;
  userId: UserId;
  at: Date;
  actor: AuditActor;
  action: AuditAction;
  callId: CallId | null;
  /** Ids, counts and codes only. Never content. */
  meta: Record<string, string | number | boolean | null>;
}

export type NewAuditEvent = Omit<AuditEvent, 'id' | 'at'>;
