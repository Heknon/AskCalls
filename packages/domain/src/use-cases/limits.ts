import type { UserId } from '../entities/common';
import { effectiveLimits, type Limits } from '../limits';
import type { Ports } from '../ports-bundle';
import { dayStart, monthStart, usageKeys } from './context';

/** The limits that apply to one account: the instance limits with the account's overrides. */
export async function limitsFor(
  ports: Pick<Ports, 'users' | 'limits'>,
  userId: UserId,
): Promise<Limits> {
  const user = await ports.users.findById(userId);
  return effectiveLimits(ports.limits, user?.limitOverrides ?? {});
}

export interface AccountUsage {
  calls: number;
  recordingBytes: number;
  transcriptionSecondsThisMonth: number;
  asksToday: number;
  translationCharsThisMonth: number;
  apiTokens: number;
}

/** Counters measured against `Limits`. Counts and sizes only. */
export async function accountUsage(
  ports: Pick<Ports, 'calls' | 'rateLimiter' | 'apiTokens'>,
  userId: UserId,
  now: Date,
): Promise<AccountUsage> {
  const [calls, recordingBytes, seconds, asks, chars, tokens] = await Promise.all([
    ports.calls.count(userId),
    ports.calls.totalRecordingBytes(userId),
    ports.rateLimiter.usage(usageKeys.transcriptionSeconds(userId), monthStart(now)),
    ports.rateLimiter.usage(usageKeys.asks(userId), dayStart(now)),
    ports.rateLimiter.usage(usageKeys.translationChars(userId), monthStart(now)),
    ports.apiTokens.countActive(userId, now),
  ]);
  return {
    calls,
    recordingBytes,
    transcriptionSecondsThisMonth: seconds,
    asksToday: asks,
    translationCharsThisMonth: chars,
    apiTokens: tokens,
  };
}
