import type { FailureReason } from '@askcalls/client-core/errors';
import type { ActiveStatus } from '@askcalls/client-core/ingest';
import type { Providers } from '@askcalls/client-core/userdata';
import type { Me } from '../../../../../../client/session/session';

/** Where audio goes for transcription, as the upload screen shows it before anything is sent. */
export type TranscriptionFlow =
  | { route: 'managed' | 'direct'; provider: string }
  | { route: 'off'; provider: null };

export function transcriptionFlow(providers: Providers, me: Me): TranscriptionFlow {
  const tx = providers.transcription;
  if (tx.mode === 'own') return { route: 'direct', provider: tx.key.provider };
  if (tx.mode === 'managed' && me.features.transcription.enabled) {
    return { route: 'managed', provider: me.features.transcription.provider ?? 'managed' };
  }
  return { route: 'off', provider: null };
}

/** Managed minutes left this month; own keys are not counted. */
export function minutesLeft(me: Me, flow: TranscriptionFlow): number | null {
  if (flow.route !== 'managed') return null;
  const used = me.usage.transcriptionSecondsThisMonth / 60;
  return Math.max(0, Math.floor(me.limits.transcriptionMinutesPerMonth - used));
}

export type QuotaWarning =
  | { kind: 'minutes'; needed: number; left: number }
  | { kind: 'calls'; incoming: number; left: number }
  | { kind: 'storage'; percent: number };

/** Limits an import would run into (spec 12), from `/api/me`. */
export function quotaWarnings(
  me: Me,
  flow: TranscriptionFlow,
  plan: { calls: number; minutes: number; backup: boolean },
): QuotaWarning[] {
  const out: QuotaWarning[] = [];
  const left = minutesLeft(me, flow);
  if (left !== null && plan.minutes > left) {
    out.push({ kind: 'minutes', needed: plan.minutes, left });
  }
  const callsLeft = Math.max(0, me.limits.maxCalls - me.usage.calls);
  if (plan.calls > callsLeft) out.push({ kind: 'calls', incoming: plan.calls, left: callsLeft });
  const { recordingBytes } = me.limits;
  if (plan.backup && recordingBytes > 0 && me.usage.recordingBytes >= recordingBytes * 0.8) {
    out.push({
      kind: 'storage',
      percent: Math.min(100, Math.round((me.usage.recordingBytes / recordingBytes) * 100)),
    });
  }
  return out;
}

/** The message key for a failure; the step disambiguates which limit was reached. */
export function failureKey(reason: FailureReason, step: ActiveStatus | null): string {
  if (reason === 'quota_exceeded') {
    if (step === 'transcribing') return 'reason.quotaMinutes';
    if (step === 'uploading') return 'reason.quotaCalls';
    return 'reason.quota';
  }
  return `reason.${reason}`;
}

/** "About 35 min left" from the pace of this session; null until there is a pace to go by. */
export function remainingSeconds(
  finished: number,
  elapsedMs: number,
  remaining: number,
): number | null {
  if (finished < 1 || remaining < 1 || elapsedMs <= 0) return null;
  return Math.max(1, Math.round(((elapsedMs / finished) * remaining) / 1000));
}
