/**
 * 0002: local-account credentials (spec 11.2b): one Argon2id password hash per user and the
 * passkeys used to sign in (Auth.js WebAuthn). Sign-in passkeys are separate from the
 * keyring's unlock passkeys. User-owned: RLS like every other user table.
 */
export const sql = /* sql */ `
CREATE TABLE "PasswordCredential" (
  "userId" text COLLATE "C" PRIMARY KEY REFERENCES "User" ("id") ON DELETE CASCADE,
  "hash" text NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE TABLE "SignInPasskey" (
  "credentialId" text COLLATE "C" PRIMARY KEY,
  "userId" text COLLATE "C" NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
  "providerAccountId" text NOT NULL,
  "publicKey" text NOT NULL,
  "counter" bigint NOT NULL DEFAULT 0,
  "deviceType" text NOT NULL,
  "backedUp" boolean NOT NULL,
  "transports" text,
  "createdAt" timestamptz NOT NULL
);
CREATE INDEX "SignInPasskey_userId_idx" ON "SignInPasskey" ("userId");

ALTER TABLE "PasswordCredential" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "PasswordCredential_owner" ON "PasswordCredential" TO askcalls_app
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));
ALTER TABLE "SignInPasskey" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SignInPasskey_owner" ON "SignInPasskey" TO askcalls_app
  USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "PasswordCredential", "SignInPasskey" TO askcalls_app;
`;
