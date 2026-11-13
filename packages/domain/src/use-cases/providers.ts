import { DomainError, isDomainError } from '../entities/errors';
import type { ClientToken, TranscribeResult } from '../ports/providers';
import type { Ports } from '../ports-bundle';
import { supportsDirectTokens } from './account';
import { type Actor, audit, dayWindow, monthWindow, nextMonthStart, usageKeys } from './context';

/**
 * Plaintext pass-through use cases (spec 2.2): audio to the transcription provider, one call to
 * the LLM. Nothing here stores, logs or audits content; audit meta holds counts only.
 */
export const PROVIDER_LIMITS = {
  /** Spec 8: one chunk of at most 4 MB per /api/transcribe request. */
  transcribeChunkBytes: 4 * 1_024 * 1_024,
  /** A declared duration for one direct-mode token. */
  directTokenMaxSeconds: 4 * 3_600,
  questionChars: 4_000,
  transcriptChars: 1_000_000,
  historyTurns: 20,
  historyChars: 40_000,
} as const;

export interface TranscribeUsage {
  usedSeconds: number;
  limitSeconds: number;
}

function transcriptionLimitSeconds(ports: Ports): number {
  return ports.limits.transcriptionMinutesPerMonth * 60;
}

function quotaExceeded(ports: Ports, now: Date): DomainError {
  return new DomainError('quota_exceeded', 'monthly transcription minutes are used up', {
    limit: ports.limits.transcriptionMinutesPerMonth,
    quota: 'transcription_minutes',
    resetAt: nextMonthStart(now).toISOString(),
  });
}

/** Seconds of audio a result covers: the provider's duration, else the last segment's end. */
export function billedSeconds(result: TranscribeResult): number {
  const fromSegments = result.segments.reduce((m, s) => Math.max(m, s.end), 0);
  const sec = result.durationSec ?? fromSegments;
  return Math.max(1, Math.ceil(Number.isFinite(sec) ? sec : 0));
}

/**
 * Proxy transcription of one chunk. The monthly quota is counted in seconds of transcribed
 * audio (RateLimiter.consume with a monthly window): checked before the provider call, charged
 * with the duration the provider reports. Two concurrent chunks may overshoot by one chunk.
 */
export async function transcribeChunk(
  ports: Ports,
  actor: Actor,
  input: { audio: Uint8Array; mimeType: string; language: string; signal?: AbortSignal },
): Promise<{ result: TranscribeResult; usage: TranscribeUsage }> {
  const provider = ports.transcription;
  if (!provider) throw new DomainError('unsupported', 'transcription is turned off');
  const max = Math.min(PROVIDER_LIMITS.transcribeChunkBytes, provider.capabilities.maxChunkBytes);
  if (input.audio.length === 0) throw new DomainError('invalid', 'audio is empty');
  if (input.audio.length > max) {
    throw new DomainError('invalid', 'audio chunk is too large', { maxBytes: max });
  }
  const now = ports.clock.now();
  const key = usageKeys.transcriptionSeconds(actor.userId);
  const window = monthWindow(now);
  const limitSeconds = transcriptionLimitSeconds(ports);
  if ((await ports.rateLimiter.usage(key, window.start)) >= limitSeconds)
    throw quotaExceeded(ports, now);

  let result: TranscribeResult;
  try {
    result = await provider.transcribe({
      audio: input.audio,
      mimeType: input.mimeType,
      language: input.language,
      ...(input.signal && { signal: input.signal }),
    });
  } catch (e) {
    if (isDomainError(e)) throw e;
    throw new DomainError('provider_error', 'transcription provider failed', {
      provider: provider.id,
    });
  }
  const seconds = billedSeconds(result);
  const { used } = await ports.rateLimiter.consume(key, window, seconds, null);
  await audit(ports, actor, actor.userId, 'transcribe', null, { seconds, mode: 'proxy' });
  return { result, usage: { usedSeconds: used, limitSeconds } };
}

/**
 * Direct mode (spec 8): a single-use provider token. The client declares the decoded audio
 * duration, which is charged up front, so direct uploads still count toward the quota.
 */
export async function mintTranscriptionToken(
  ports: Ports,
  actor: Actor,
  input: { durationSec: number },
): Promise<{ token: ClientToken; usage: TranscribeUsage }> {
  const provider = ports.transcription;
  if (!provider) throw new DomainError('unsupported', 'transcription is turned off');
  if (!supportsDirectTokens(provider.id, provider.capabilities.clientTokens)) {
    throw new DomainError('unsupported', 'direct upload is not available for this provider');
  }
  const seconds = Math.ceil(input.durationSec);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > PROVIDER_LIMITS.directTokenMaxSeconds) {
    throw new DomainError('invalid', 'durationSec must be 1..14400');
  }
  const now = ports.clock.now();
  const key = usageKeys.transcriptionSeconds(actor.userId);
  const window = monthWindow(now);
  const limitSeconds = transcriptionLimitSeconds(ports);
  const consumed = await ports.rateLimiter.consume(key, window, seconds, limitSeconds);
  if (!consumed.allowed) throw quotaExceeded(ports, now);
  let token: ClientToken;
  try {
    token = await provider.mintClientToken();
  } catch (e) {
    // Refund: nothing was transcribed.
    await ports.rateLimiter.consume(key, window, -seconds, null);
    if (isDomainError(e)) throw e;
    throw new DomainError('provider_error', 'transcription provider failed', {
      provider: provider.id,
    });
  }
  await audit(ports, actor, actor.userId, 'transcribe', null, { seconds, mode: 'direct' });
  return { token, usage: { usedSeconds: consumed.used, limitSeconds } };
}

export interface AskInput {
  question: string;
  transcriptText: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  consent: boolean;
  signal?: AbortSignal;
}

/**
 * "Ask about this call" (spec 2.2): one decrypted transcript goes to the LLM with explicit
 * per-request consent; 50 asks per user per UTC day. The adapter wraps the transcript as
 * untrusted data with ASK_SYSTEM_PROMPT.
 */
export async function askAboutCall(
  ports: Ports,
  actor: Actor,
  input: AskInput,
): Promise<AsyncIterable<string>> {
  const llm = ports.llm;
  if (!llm) throw new DomainError('unsupported', 'ask is turned off');
  if (input.consent !== true) throw new DomainError('invalid', 'consent is required');
  if (!input.question.trim() || input.question.length > PROVIDER_LIMITS.questionChars) {
    throw new DomainError('invalid', 'question must be 1..4000 characters');
  }
  if (!input.transcriptText || input.transcriptText.length > PROVIDER_LIMITS.transcriptChars) {
    throw new DomainError('invalid', 'transcript is empty or too long');
  }
  const history = input.history ?? [];
  if (
    history.length > PROVIDER_LIMITS.historyTurns ||
    history.reduce((n, h) => n + h.content.length, 0) > PROVIDER_LIMITS.historyChars
  ) {
    throw new DomainError('invalid', 'conversation history is too long');
  }
  const now = ports.clock.now();
  const window = dayWindow(now);
  const used = await ports.rateLimiter.consume(
    usageKeys.asks(actor.userId),
    window,
    1,
    ports.limits.asksPerDay,
  );
  if (!used.allowed) {
    const retryAfterSec = Math.ceil((window.end.getTime() - now.getTime()) / 1000);
    throw new DomainError('rate_limited', 'daily ask limit reached', {
      limit: ports.limits.asksPerDay,
      quota: 'asks',
      retryAfterSec,
    });
  }
  await audit(ports, actor, actor.userId, 'ask', null, { provider: llm.id });
  return llm.ask({
    question: input.question,
    transcriptText: input.transcriptText,
    history,
    ...(input.signal && { signal: input.signal }),
  });
}
