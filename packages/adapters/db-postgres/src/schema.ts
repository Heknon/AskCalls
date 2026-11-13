import {
  bigint,
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { toBytes, toDriverBytes } from './codec';

/**
 * Drizzle mirror of the committed SQL migrations (src/migrations). The SQL is the source of
 * truth for the database; this file only types queries. Indexes, checks, RLS and the
 * CallChunk table (halfvec, raw SQL only) live in the migrations.
 */

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'bytea',
  toDriver: (v) => toDriverBytes(v),
  fromDriver: (v) => toBytes(v),
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const tok = (name: string) => bigint(name, { mode: 'bigint' });

export const users = pgTable('User', {
  id: text('id').primaryKey(),
  email: text('email'),
  name: text('name'),
  image: text('image'),
  plan: text('plan', { enum: ['free', 'pro'] }).notNull(),
  role: text('role', { enum: ['user', 'admin'] }).notNull(),
  locale: text('locale'),
  telemetryConsent: jsonb('telemetryConsent')
    .$type<{ productEvents: boolean; errorReports: boolean }>()
    .notNull(),
  retentionDays: integer('retentionDays'),
  createdAt: ts('createdAt').notNull(),
  deletedAt: ts('deletedAt'),
});

export const accounts = pgTable(
  'Account',
  {
    userId: text('userId').notNull(),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const verificationTokens = pgTable(
  'VerificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: ts('expires').notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const keyring = pgTable('Keyring', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  kind: text('kind', { enum: ['passkey', 'recovery', 'passphrase', 'device'] }).notNull(),
  label: text('label').notNull(),
  credentialId: text('credentialId'),
  wrappedRootKey: bytea('wrappedRootKey').notNull(),
  kdfParams: jsonb('kdfParams').$type<Record<string, unknown>>().notNull(),
  createdAt: ts('createdAt').notNull(),
  lastUsedAt: ts('lastUsedAt'),
  revokedAt: ts('revokedAt'),
});

export const userKeys = pgTable('UserKeys', {
  userId: text('userId').primaryKey(),
  inboxPublicKey: bytea('inboxPublicKey').notNull(),
  inboxPrivateKeyCt: bytea('inboxPrivateKeyCt').notNull(),
  keyVersion: integer('keyVersion').notNull(),
});

export const deviceKeys = pgTable('DeviceKey', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  label: text('label').notNull(),
  signingPublicKey: bytea('signingPublicKey').notNull(),
  createdAt: ts('createdAt').notNull(),
  revokedAt: ts('revokedAt'),
});

export const deviceLinkSessions = pgTable('DeviceLinkSession', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  secretHash: bytea('secretHash').notNull(),
  state: text('state', {
    enum: ['waiting_for_device', 'waiting_for_confirmation', 'completed', 'expired'],
  }).notNull(),
  devicePublicKey: bytea('devicePublicKey'),
  deviceLabel: text('deviceLabel'),
  encryptedRootKey: bytea('encryptedRootKey'),
  createdAt: ts('createdAt').notNull(),
  expiresAt: ts('expiresAt').notNull(),
});

export const calls = pgTable('Call', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  status: text('status', { enum: ['ready', 'pending_inbox', 'failed'] }).notNull(),
  source: text('source', { enum: ['app', 'agent', 'inbox'] }).notNull(),
  day: integer('day').notNull(),
  durationBucket: smallint('durationBucket').notNull(),
  wrappedDek: bytea('wrappedDek').notNull(),
  transcriptCt: bytea('transcriptCt').notNull(),
  metaCt: bytea('metaCt').notNull(),
  contactTok: tok('contactTok'),
  keywordToks: tok('keywordToks').array().notNull(),
  tagToks: tok('tagToks').array().notNull(),
  audioTok: tok('audioTok'),
  contentTok: tok('contentTok').notNull(),
  recordingBucketRef: text('recordingBucketRef'),
  recordingKey: text('recordingKey'),
  recordingBytes: bigint('recordingBytes', { mode: 'number' }),
  createdAt: ts('createdAt').notNull(),
  updatedAt: ts('updatedAt').notNull(),
});

export const vocabDeltas = pgTable('VocabDelta', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  seq: integer('seq').notNull(),
  ct: bytea('ct').notNull(),
  compacted: boolean('compacted').notNull(),
  createdAt: ts('createdAt').notNull(),
});

export const userData = pgTable(
  'UserData',
  {
    userId: text('userId').notNull(),
    kind: text('kind', {
      enum: ['tags', 'contacts', 'rules', 'synonyms', 'settings', 'providers'],
    }).notNull(),
    ct: bytea('ct').notNull(),
    version: integer('version').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind] })],
);

export const inboxItems = pgTable('InboxItem', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  ephemeralPublicKey: bytea('ephemeralPublicKey').notNull(),
  payloadCt: bytea('payloadCt'),
  blobKey: text('blobKey'),
  createdAt: ts('createdAt').notNull(),
  expiresAt: ts('expiresAt').notNull(),
});

export const apiTokens = pgTable('ApiToken', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  name: text('name').notNull(),
  tokenHash: bytea('tokenHash').notNull(),
  scopes: text('scopes', { enum: ['read', 'write', 'ask', 'keys'] })
    .array()
    .notNull(),
  createdAt: ts('createdAt').notNull(),
  lastUsedAt: ts('lastUsedAt'),
  expiresAt: ts('expiresAt'),
  revokedAt: ts('revokedAt'),
  fetchesThisHour: integer('fetchesThisHour').notNull(),
  hourWindowStart: ts('hourWindowStart'),
});

export const auditEvents = pgTable('AuditEvent', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  at: ts('at').notNull(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  callId: text('callId'),
  meta: jsonb('meta').$type<Record<string, string | number | boolean | null>>().notNull(),
});

export const rateBuckets = pgTable(
  'RateBucket',
  {
    key: text('key').notNull(),
    windowStart: ts('windowStart').notNull(),
    count: integer('count').notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const schema = {
  users,
  accounts,
  verificationTokens,
  keyring,
  userKeys,
  deviceKeys,
  deviceLinkSessions,
  calls,
  vocabDeltas,
  userData,
  inboxItems,
  apiTokens,
  auditEvents,
  rateBuckets,
};
