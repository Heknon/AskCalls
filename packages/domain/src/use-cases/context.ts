import type { CallId, UserId } from '../entities/common';
import { DomainError } from '../entities/errors';
import type { ApiScope, AuditAction, AuditActor } from '../entities/other';
import type { User } from '../entities/user';
import type { Ports } from '../ports-bundle';

/**
 * Who is making a request. Every use case scopes by `actor.userId`; nothing takes a user id
 * from request input.
 */
export type Actor =
  | { kind: 'session'; userId: UserId }
  | { kind: 'token'; userId: UserId; tokenId: string; scopes: readonly ApiScope[] };

export function auditActor(actor: Actor | 'system'): AuditActor {
  if (actor === 'system') return 'system';
  return actor.kind === 'session' ? 'session' : `token:${actor.tokenId}`;
}

type Meta = Record<string, string | number | boolean | null>;

/** Appends a content-free audit event. `meta` holds ids, counts and codes only. */
export async function audit(
  ports: Pick<Ports, 'audit'>,
  actor: Actor | 'system',
  userId: UserId,
  action: AuditAction,
  callId: CallId | null = null,
  meta: Meta = {},
): Promise<void> {
  await ports.audit.append({ userId, actor: auditActor(actor), action, callId, meta });
}

export async function requireUser(ports: Pick<Ports, 'users'>, userId: UserId): Promise<User> {
  const user = await ports.users.findById(userId);
  if (!user || user.deletedAt) throw new DomainError('unauthorized', 'account not found');
  return user;
}

export function requireSession(actor: Actor): void {
  if (actor.kind !== 'session') throw new DomainError('forbidden', 'requires a signed-in session');
}

export const HOUR_MS = 3_600_000;

/** Start of the UTC month containing `now`: the window for monthly quotas. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Start of the UTC day containing `now`: the window for daily quotas. */
export function dayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function nextMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Usage-counter keys (RateLimiter.consume). Ids only. */
export const usageKeys = {
  transcriptionSeconds: (userId: UserId) => `usage:transcribe-sec:${userId}`,
  asks: (userId: UserId) => `usage:ask:${userId}`,
  translationChars: (userId: UserId) => `usage:translate-chars:${userId}`,
};

/** Blob keys. Opaque: user and call ids plus a random suffix, never content. */
export const blobKeys = {
  recordingPrefix: (userId: UserId) => `rec/${userId}/`,
  recording: (userId: UserId, callId: CallId, suffix: string) =>
    `rec/${userId}/${callId}/${suffix}`,
  inboxPrefix: (userId: UserId) => `inbox/${userId}/`,
  inbox: (userId: UserId, id: string) => `inbox/${userId}/${id}`,
};

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource));
}

export function randomBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

export function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
