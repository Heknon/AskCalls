import type { Page } from '../entities/common';
import { DomainError } from '../entities/errors';
import type { AuditAction, AuditEvent } from '../entities/other';
import type { Plan, User, UserRole } from '../entities/user';
import type { Limits } from '../limits';
import type { Ports } from '../ports-bundle';
import {
  type Actor,
  blobKeys,
  dayStart,
  monthStart,
  requireSession,
  requireUser,
  usageKeys,
} from './context';
import type { KeyringEntrySummary } from './keyring';

export interface MeResult {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    image: string | null;
    plan: Plan;
    role: UserRole;
    locale: string | null;
    createdAt: Date;
  };
  telemetryConsent: User['telemetryConsent'];
  retentionDays: number | null;
  limits: Limits;
  usage: {
    calls: number;
    recordingBytes: number;
    transcriptionSecondsThisMonth: number;
    asksToday: number;
    translationCharsThisMonth: number;
    apiTokens: number;
    inboxPending: number;
  };
  keyring: {
    entries: KeyringEntrySummary[];
    hasUserKeys: boolean;
    keyVersion: number | null;
    devices: number;
  };
  features: {
    transcription: { enabled: boolean; provider: string | null; directTokens: boolean };
    llm: { enabled: boolean; provider: string | null; model: string | null };
    /** Managed translation through /api/translate; needs the LLM. */
    translation: { enabled: boolean };
  };
}

/** GET /api/me: user, plan, limits, usage and keyring summary. Content-free by construction. */
export async function getMe(ports: Ports, actor: Actor): Promise<MeResult> {
  const user = await requireUser(ports, actor.userId);
  const now = ports.clock.now();
  const userId = user.id;
  const [calls, recordingBytes, seconds, asks, chars, tokens, inbox, entries, keys, devices] =
    await Promise.all([
      ports.calls.count(userId),
      ports.calls.totalRecordingBytes(userId),
      ports.rateLimiter.usage(usageKeys.transcriptionSeconds(userId), monthStart(now)),
      ports.rateLimiter.usage(usageKeys.asks(userId), dayStart(now)),
      ports.rateLimiter.usage(usageKeys.translationChars(userId), monthStart(now)),
      ports.apiTokens.countActive(userId, now),
      ports.inbox.count(userId),
      ports.keyring.list(userId),
      ports.keyring.getUserKeys(userId),
      ports.keyring.listDevices(userId),
    ]);
  const t = ports.transcription;
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      plan: user.plan,
      role: user.role,
      locale: user.locale,
      createdAt: user.createdAt,
    },
    telemetryConsent: user.telemetryConsent,
    retentionDays: user.retentionDays,
    limits: ports.limits,
    usage: {
      calls,
      recordingBytes,
      transcriptionSecondsThisMonth: seconds,
      asksToday: asks,
      translationCharsThisMonth: chars,
      apiTokens: tokens,
      inboxPending: inbox,
    },
    keyring: {
      entries: entries.map(({ wrappedRootKey: _w, userId: _u, ...e }) => e),
      hasUserKeys: keys !== null,
      keyVersion: keys?.keyVersion ?? null,
      devices: devices.filter((d) => !d.revokedAt).length,
    },
    features: {
      transcription: {
        enabled: t !== null,
        provider: t?.id ?? null,
        directTokens: t !== null && supportsDirectTokens(t.id, t.capabilities.clientTokens),
      },
      llm: {
        enabled: ports.llm !== null,
        provider: ports.llm?.id ?? null,
        model: ports.llm?.model ?? null,
      },
      translation: { enabled: ports.llm !== null && ports.translationEnabled },
    },
  };
}

/**
 * Direct-mode tokens (spec 8): ElevenLabs only documents single-use tokens for realtime Scribe,
 * so direct mode stays off for it in R1 even though its adapter can mint them.
 */
export function supportsDirectTokens(providerId: string, clientTokens: boolean): boolean {
  return clientTokens && providerId !== 'elevenlabs';
}

export async function setTelemetryConsent(
  ports: Ports,
  actor: Actor,
  consent: User['telemetryConsent'],
): Promise<User['telemetryConsent']> {
  requireSession(actor);
  const user = await ports.users.update(actor.userId, {
    telemetryConsent: { productEvents: consent.productEvents, errorReports: consent.errorReports },
  });
  return user.telemetryConsent;
}

export async function listAudit(
  ports: Ports,
  actor: Actor,
  input: { cursor?: string | null; limit?: number; action?: AuditAction },
): Promise<Page<Omit<AuditEvent, 'userId'>>> {
  requireSession(actor);
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new DomainError('invalid', 'limit must be 1..100');
  }
  const page = await ports.audit.list(
    actor.userId,
    { limit, cursor: input.cursor ?? null },
    input.action ? { action: input.action } : undefined,
  );
  return { items: page.items.map(({ userId: _u, ...e }) => e), nextCursor: page.nextCursor };
}

export interface AccountDeletionResult {
  /**
   * Recordings in the user's own buckets: the server has no credentials for them, so the
   * device deletes them itself (spec 9, account deletion warns about this).
   */
  ownBucketRecordings: Array<{ bucketRef: string; objectKey: string }>;
  deletedBlobs: number;
}

/**
 * Crypto-shred (spec 11.2): deletes every blob in the instance bucket and every row the user
 * owns. Ciphertext that survives elsewhere (backups) is unreadable without the user's keys.
 */
export async function deleteAccount(ports: Ports, actor: Actor): Promise<AccountDeletionResult> {
  requireSession(actor);
  const userId = actor.userId;
  await requireUser(ports, userId);
  const ownBucketRecordings: AccountDeletionResult['ownBucketRecordings'] = [];
  let cursor: string | null = null;
  do {
    const page = await ports.calls.list(userId, {}, { limit: 100, cursor });
    for (const s of page.items) {
      if (!s.hasRecording) continue;
      const rec = (await ports.calls.get(userId, s.id))?.recording;
      if (rec && rec.bucketRef !== null) {
        ownBucketRecordings.push({ bucketRef: rec.bucketRef, objectKey: rec.objectKey });
      }
    }
    cursor = page.nextCursor;
  } while (cursor);
  const deletedBlobs =
    (await ports.blobs.deletePrefix(blobKeys.recordingPrefix(userId))) +
    (await ports.blobs.deletePrefix(blobKeys.inboxPrefix(userId)));
  await ports.users.deleteHard(userId);
  return { ownBucketRecordings, deletedBlobs };
}
