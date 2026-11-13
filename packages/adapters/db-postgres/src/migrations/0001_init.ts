/**
 * 0001: initial schema (spec 5). Committed SQL; never edit once it has reached `dev`, add a
 * new migration instead (CLAUDE.md, spec 14.1). Runs inside one transaction.
 *
 * Every user-owned table has `userId`, row-level security enabled, and one policy for the
 * `askcalls_app` role keyed on `app.user_id`. See README.md, "Row-level security".
 */
export const sql = /* sql */ `
CREATE EXTENSION IF NOT EXISTS vector;

-- The role user-scoped transactions switch to (SET LOCAL ROLE). It cannot log in and does not
-- bypass RLS. Roles are cluster-wide, so another database on the same server may have made it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askcalls_app') THEN
    CREATE ROLE askcalls_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;
GRANT askcalls_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO askcalls_app;

CREATE TABLE "User" (
  "id" text COLLATE "C" PRIMARY KEY,
  "email" text UNIQUE,
  "name" text,
  "image" text,
  "plan" text NOT NULL DEFAULT 'free' CHECK ("plan" IN ('free', 'pro')),
  "role" text NOT NULL DEFAULT 'user' CHECK ("role" IN ('user', 'admin')),
  "locale" text,
  "telemetryConsent" jsonb NOT NULL DEFAULT '{"productEvents": false, "errorReports": false}',
  "retentionDays" integer CHECK ("retentionDays" > 0),
  "createdAt" timestamptz NOT NULL,
  "deletedAt" timestamptz
);
CREATE INDEX "User_retention_idx" ON "User" ("id") WHERE "retentionDays" IS NOT NULL;

-- Auth.js accounts. OAuth tokens are deliberately not stored.
CREATE TABLE "Account" (
  "userId" text COLLATE "C" NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "provider" text NOT NULL,
  "providerAccountId" text NOT NULL,
  PRIMARY KEY ("provider", "providerAccountId")
);
CREATE INDEX "Account_userId_idx" ON "Account" ("userId");

-- Auth.js email tokens (already hashed by Auth.js). Not user-owned: no RLS, system path only.
CREATE TABLE "VerificationToken" (
  "identifier" text NOT NULL,
  "token" text NOT NULL,
  "expires" timestamptz NOT NULL,
  PRIMARY KEY ("identifier", "token")
);

CREATE TABLE "Keyring" (
  "id" text COLLATE "C" PRIMARY KEY,
  "userId" text COLLATE "C" NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "kind" text NOT NULL CHECK ("kind" IN ('passkey', 'recovery', 'passphrase', 'device')),
  "label" text NOT NULL,
  "credentialId" text,
  "wrappedRootKey" bytea NOT NULL,
  "kdfParams" jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamptz NOT NULL,
  "lastUsedAt" timestamptz,
  "revokedAt" timestamptz
);
CREATE INDEX "Keyring_userId_idx" ON "Keyring" ("userId");

CREATE TABLE "UserKeys" (
  "userId" text COLLATE "C" PRIMARY KEY REFERENCES "User" ("id") ON DELETE CASCADE,
  "inboxPublicKey" bytea NOT NULL,
  "inboxPrivateKeyCt" bytea NOT NULL,
  "keyVersion" integer NOT NULL
);

CREATE TABLE "DeviceKey" (
  "id" text COLLATE "C" PRIMARY KEY,
  "userId" text COLLATE "C" NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "signingPublicKey" bytea NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "revokedAt" timestamptz
);
CREATE INDEX "DeviceKey_userId_idx" ON "DeviceKey" ("userId");

CREATE TABLE "DeviceLinkSession" (
  "id" text COLLATE "C" PRIMARY KEY,
  "userId" text COLLATE "C" NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "secretHash" bytea NOT NULL,
  "state" text NOT NULL
    CHECK ("state" IN ('waiting_for_device', 'waiting_for_confirmation', 'completed', 'expired')),
  "devicePublicKey" bytea,
  "deviceLabel" text,
  "encryptedRootKey" bytea,
  "createdAt" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL
);
CREATE INDEX "DeviceLinkSession_userId_idx" ON "DeviceLinkSession" ("userId");
CREATE INDEX "DeviceLinkSession_expiresAt_idx" ON "DeviceLinkSession" ("expiresAt");

CREATE TABLE "Call" (
  "id" text COLLATE "C" PRIMARY KEY,
  "userId" text COLLATE "C" NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "status" text NOT NULL CHECK ("status" IN ('ready', 'pending_inbox', 'failed')),
  "source" text NOT NULL CHECK ("source" IN ('app', 'agent', 'inbox')),
  "day" integer NOT NULL,
  "durationBucket" smallint NOT NULL CHECK ("durationBucket" BETWEEN 0 AND 4),
  "wrappedDek" bytea NOT NULL,
  "transcriptCt" bytea NOT NULL,
  "metaCt" bytea NOT NULL,
  "contactTok" bigint,
  "keywordToks" bigint[] NOT NULL DEFAULT '{}',
  "tagToks" bigint[] NOT NULL DEFAULT '{}',
  "audioTok" bigint,
  "contentTok" bigint NOT NULL,
  -- Recording ref: null bucketRef = the instance BlobStore.
  "recordingBucketRef" text,
  "recordingKey" text,
  "recordingBytes" bigint CHECK ("recordingBytes" >= 0),
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  CONSTRAINT "Call_recording_complete"
    CHECK (("recordingKey" IS NULL) = ("recordingBytes" IS NULL)),
  CONSTRAINT "Call_id_userId_key" UNIQUE ("id", "userId"),
  CONSTRAINT "Call_userId_audioTok_key" UNIQUE ("userId", "audioTok"),
  CONSTRAINT "Call_userId_contentTok_key" UNIQUE ("userId", "contentTok")
);
CREATE INDEX "Call_keywordToks_idx" ON "Call" USING gin ("keywordToks");
CREATE INDEX "Call_tagToks_idx" ON "Call" USING gin ("tagToks");
CREATE INDEX "Call_userId_day_idx" ON "Call" ("userId", "day" DESC, "id" DESC);
CREATE INDEX "Call_userId_contactTok_idx" ON "Call" ("userId", "contactTok");

-- One row per embedded chunk. The composite foreign key keeps chunk.userId equal to its call's.
CREATE TABLE "CallChunk" (
  "callId" text COLLATE "C" NOT NULL,
  "userId" text COLLATE "C" NOT NULL,
  "ord" integer NOT NULL CHECK ("ord" >= 0),
  "embedding" halfvec(384) NOT NULL,
  "snippetCt" bytea NOT NULL,
  PRIMARY KEY ("callId", "ord"),
  FOREIGN KEY ("callId", "userId") REFERENCES "Call" ("id", "userId") ON DELETE CASCADE
);
CREATE INDEX "CallChunk_userId_idx" ON "CallChunk" ("userId");
CREATE INDEX "CallChunk_embedding_idx" ON "CallChunk" USING hnsw ("embedding" halfvec_cosine_ops);

CREATE TABLE "VocabDelta" (
  "id" text COLLATE "C" PRIMARY KEY,
  "userId" text COLLATE "C" NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "seq" integer NOT NULL CHECK ("seq" > 0),
  "ct" bytea NOT NULL,
  "compacted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL,
  CONSTRAINT "VocabDelta_userId_seq_key" UNIQUE ("userId", "seq")
);

CREATE TABLE "UserData" (
  "userId" text COLLATE "C" NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "kind" text NOT NULL
    CHECK ("kind" IN ('tags', 'contacts', 'rules', 'synonyms', 'settings', 'providers')),
  "ct" bytea NOT NULL,
  "version" integer NOT NULL CHECK ("version" > 0),
  PRIMARY KEY ("userId", "kind")
);

CREATE TABLE "InboxItem" (
  "id" text COLLATE "C" PRIMARY KEY,
  "userId" text COLLATE "C" NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "ephemeralPublicKey" bytea NOT NULL,
  "payloadCt" bytea,
  "blobKey" text,
  "createdAt" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  CONSTRAINT "InboxItem_payload_present" CHECK ("payloadCt" IS NOT NULL OR "blobKey" IS NOT NULL)
);
CREATE INDEX "InboxItem_userId_idx" ON "InboxItem" ("userId", "createdAt");
CREATE INDEX "InboxItem_expiresAt_idx" ON "InboxItem" ("expiresAt");

CREATE TABLE "ApiToken" (
  "id" text COLLATE "C" PRIMARY KEY,
  "userId" text COLLATE "C" NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "tokenHash" bytea NOT NULL UNIQUE,
  "scopes" text[] NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "lastUsedAt" timestamptz,
  "expiresAt" timestamptz,
  "revokedAt" timestamptz,
  "fetchesThisHour" integer NOT NULL DEFAULT 0,
  "hourWindowStart" timestamptz
);
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken" ("userId");

-- No foreign key on callId: the audit trail outlives the call it describes.
CREATE TABLE "AuditEvent" (
  "id" text COLLATE "C" PRIMARY KEY,
  "userId" text COLLATE "C" NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "at" timestamptz NOT NULL,
  "actor" text NOT NULL,
  "action" text NOT NULL,
  "callId" text COLLATE "C",
  "meta" jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX "AuditEvent_userId_at_idx" ON "AuditEvent" ("userId", "at" DESC, "id" DESC);
CREATE INDEX "AuditEvent_userId_action_at_idx"
  ON "AuditEvent" ("userId", "action", "at" DESC, "id" DESC);

-- Sliding-window rate limiter buckets (two fixed windows, weighted). Keys hold ids, no content.
CREATE TABLE "RateBucket" (
  "key" text COLLATE "C" NOT NULL,
  "windowStart" timestamptz NOT NULL,
  "count" integer NOT NULL,
  PRIMARY KEY ("key", "windowStart")
);

-- Row-level security: the second line of defense behind the explicit userId filters.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User_owner" ON "User" TO askcalls_app
  USING ("id" = current_setting('app.user_id', true))
  WITH CHECK ("id" = current_setting('app.user_id', true));

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Account', 'Keyring', 'UserKeys', 'DeviceKey', 'DeviceLinkSession', 'Call', 'CallChunk',
    'VocabDelta', 'UserData', 'InboxItem', 'ApiToken', 'AuditEvent'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I TO askcalls_app '
      'USING ("userId" = current_setting(''app.user_id'', true)) '
      'WITH CHECK ("userId" = current_setting(''app.user_id'', true))',
      t || '_owner', t
    );
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "User", "Account", "Keyring", "UserKeys", "DeviceKey", "DeviceLinkSession", "Call",
  "CallChunk", "VocabDelta", "UserData", "InboxItem", "ApiToken", "AuditEvent"
  TO askcalls_app;
`;
