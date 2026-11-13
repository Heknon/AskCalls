import { ApiError } from '@askcalls/api-contract';
import { isCryptoError } from '@askcalls/crypto';
import { DomainError, isDomainError } from '@askcalls/domain';

/** Content-free reasons an ingest can fail, shown per file in the bulk queue. */
export type FailureReason =
  | 'audio_unreadable'
  | 'transcript_unreadable'
  | 'transcript_empty'
  | 'transcription_unavailable'
  | 'transcription_failed'
  | 'provider_key_rejected'
  | 'provider_permission'
  | 'provider_zero_retention'
  | 'nothing_to_ingest'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'locked'
  | 'unauthorized'
  | 'upload_failed'
  | 'indexing_failed'
  | 'unknown';

/** A failure inside a known step. The reason is content-free. */
export class IngestError extends DomainError {
  constructor(
    readonly reason: FailureReason,
    message: string,
  ) {
    super('invalid', message, { reason });
    this.name = 'IngestError';
  }
}

const REFUSALS: Record<string, FailureReason> = {
  invalid_key: 'provider_key_rejected',
  missing_permission: 'provider_permission',
  zero_retention_unavailable: 'provider_zero_retention',
};

/** Why the transcription provider refused, when its adapter could tell (`details.reason`). */
export function providerRefusal(e: unknown): FailureReason | null {
  const details = e instanceof ApiError ? e.details : isDomainError(e) ? e.details : null;
  const reason = details?.reason;
  return typeof reason === 'string' ? (REFUSALS[reason] ?? null) : null;
}

export function failureReason(e: unknown): FailureReason {
  if (e instanceof IngestError) return e.reason;
  if (isCryptoError(e) && e.reason === 'locked') return 'locked';
  if (e instanceof ApiError) {
    if (e.code === 'quota_exceeded') return 'quota_exceeded';
    if (e.code === 'rate_limited' || e.status === 429) return 'rate_limited';
    if (e.status === 401 || e.status === 403) return 'unauthorized';
    return 'upload_failed';
  }
  if (isDomainError(e) && e.code === 'provider_error') return 'indexing_failed';
  return 'unknown';
}

/** A 409 from `POST /api/calls`: the existing call and what matched. */
export function duplicateOf(e: unknown): { existingId: string; match: 'audio' | 'content' } | null {
  if (!(e instanceof ApiError) || e.code !== 'duplicate') return null;
  const existingId = e.details.existingId;
  if (typeof existingId !== 'string') return null;
  return { existingId, match: e.details.match === 'audio' ? 'audio' : 'content' };
}
