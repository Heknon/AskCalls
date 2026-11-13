import type { UserId } from './common';

export type Plan = 'free' | 'pro';
export type UserRole = 'user' | 'admin';

export interface User {
  id: UserId;
  email: string | null;
  name: string | null;
  image: string | null;
  plan: Plan;
  role: UserRole;
  /** Preferred UI locale (en, he, …). Null means resolve from cookie / Accept-Language. */
  locale: string | null;
  /** Telemetry opt-ins stored on the account (spec 11.3a). */
  telemetryConsent: { productEvents: boolean; errorReports: boolean };
  /** Retention in days; null keeps calls forever. Plaintext policy, holds no content. */
  retentionDays: number | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface NewUser {
  email: string | null;
  name?: string | null;
  image?: string | null;
}

/** An OAuth or email sign-in method linked to a user (Auth.js accounts). Tokens are not stored. */
export interface LinkedAccount {
  userId: string;
  /** Auth.js provider id: google, github, email, credentials, … */
  provider: string;
  providerAccountId: string;
  type: string;
}

/** Email magic-link token. Auth.js hashes the token before it reaches the repository. */
export interface VerificationToken {
  identifier: string;
  token: string;
  expires: Date;
}

/**
 * A passkey for local-account sign-in (Auth.js WebAuthn). Not an unlock method: the keyring's
 * passkeys wrap the root key; these only prove who is signing in. Binary fields are base64.
 */
export interface SignInPasskey {
  credentialId: string;
  userId: string;
  providerAccountId: string;
  publicKey: string;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports: string | null;
}
