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
