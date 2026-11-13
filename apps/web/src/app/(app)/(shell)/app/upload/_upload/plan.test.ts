import type { Providers } from '@askcalls/client-core/userdata';
import { describe, expect, it } from 'vitest';
import type { Me } from '../../../../../../client/session/session';
import {
  failureKey,
  minutesLeft,
  quotaWarnings,
  remainingSeconds,
  transcriptionFlow,
} from './plan';

const me = (over: { seconds?: number; calls?: number; recBytes?: number; tx?: boolean } = {}) =>
  ({
    limits: {
      maxCalls: 500,
      transcriptionMinutesPerMonth: 300,
      recordingBytes: 2_000,
    },
    usage: {
      calls: over.calls ?? 10,
      recordingBytes: over.recBytes ?? 0,
      transcriptionSecondsThisMonth: over.seconds ?? 0,
    },
    features: { transcription: { enabled: over.tx ?? true, provider: 'elevenlabs' } },
  }) as unknown as Me;

const providers = (mode: 'managed' | 'off' | 'own') =>
  ({
    v: 1,
    transcription:
      mode === 'own'
        ? { mode, key: { provider: 'deepgram', apiKey: 'k', baseUrl: null, model: null } }
        : { mode },
    llm: { mode: 'managed' },
    recordings: { mode: 'managed' },
  }) as Providers;

describe('transcriptionFlow', () => {
  it('names the managed provider, the own key, or off', () => {
    expect(transcriptionFlow(providers('managed'), me())).toEqual({
      route: 'managed',
      provider: 'elevenlabs',
    });
    expect(transcriptionFlow(providers('own'), me())).toEqual({
      route: 'direct',
      provider: 'deepgram',
    });
    expect(transcriptionFlow(providers('off'), me()).route).toBe('off');
    expect(transcriptionFlow(providers('managed'), me({ tx: false })).route).toBe('off');
  });
});

describe('quota', () => {
  const managed = { route: 'managed', provider: 'x' } as const;
  it('counts managed minutes left; own keys have no quota', () => {
    expect(minutesLeft(me({ seconds: 255 * 60 + 30 }), managed)).toBe(44);
    expect(minutesLeft(me({ seconds: 400 * 60 }), managed)).toBe(0);
    expect(minutesLeft(me(), { route: 'direct', provider: 'x' })).toBeNull();
  });

  it('warns about minutes, calls and recording storage', () => {
    expect(
      quotaWarnings(me({ seconds: 250 * 60, calls: 495, recBytes: 1_700 }), managed, {
        calls: 8,
        minutes: 60,
        backup: true,
      }),
    ).toEqual([
      { kind: 'minutes', needed: 60, left: 50 },
      { kind: 'calls', incoming: 8, left: 5 },
      { kind: 'storage', percent: 85 },
    ]);
    expect(quotaWarnings(me(), managed, { calls: 3, minutes: 10, backup: false })).toEqual([]);
    expect(
      quotaWarnings(me({ recBytes: 1_900 }), managed, { calls: 1, minutes: 0, backup: false }),
    ).toEqual([]);
  });
});

describe('failureKey', () => {
  it('tells the transcription limit from the call limit by the step', () => {
    expect(failureKey('quota_exceeded', 'transcribing')).toBe('reason.quotaMinutes');
    expect(failureKey('quota_exceeded', 'uploading')).toBe('reason.quotaCalls');
    expect(failureKey('quota_exceeded', null)).toBe('reason.quota');
    expect(failureKey('audio_unreadable', 'decoding')).toBe('reason.audio_unreadable');
  });
});

describe('remainingSeconds', () => {
  it('extrapolates from the pace so far', () => {
    expect(remainingSeconds(0, 10_000, 5)).toBeNull();
    expect(remainingSeconds(4, 60_000, 0)).toBeNull();
    expect(remainingSeconds(4, 60_000, 10)).toBe(150);
  });
});
