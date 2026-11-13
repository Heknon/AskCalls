import type {
  ClientToken,
  HealthResult,
  TranscribeRequest,
  TranscribeResult,
  TranscriptionCapabilities,
  TranscriptionProvider,
} from '@askcalls/domain';
import { DomainError } from '@askcalls/domain';
import {
  audioBlob,
  baseLanguage,
  defaultFetch,
  type FetchLike,
  fileNameFor,
  normalizeLanguage,
  probe,
  readJson,
  send,
} from './http';
import { groupWords } from './segments';

export const SONIOX_DEFAULT_BASE_URL = 'https://api.soniox.com';
export const SONIOX_DEFAULT_MODEL = 'stt-async-v6';

export interface SonioxOptions {
  apiKey: string;
  /** `stt-async-v6` (default; current async model). */
  model?: string;
  baseUrl?: string;
  /** Delay between status polls. Default 1000 ms. */
  pollIntervalMs?: number;
  /** Give up after this long. Default 10 minutes. */
  timeoutMs?: number;
  fetch?: FetchLike;
}

interface SonioxFile {
  id: string;
}

interface SonioxTranscription {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  audio_duration_ms?: number | null;
  error_type?: string | null;
}

export interface SonioxTranscript {
  id: string;
  text: string;
  tokens: Array<{
    text: string;
    start_ms?: number;
    end_ms?: number;
    confidence?: number;
    speaker?: string | null;
    language?: string | null;
    translation_status?: string | null;
  }>;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Soniox async file transcription: upload the file (POST /v1/files), create a transcription
 * (POST /v1/transcriptions), poll it, read the transcript, then delete both the transcription and
 * the file. Soniox keeps uploads and results until deleted (at most 30 days), so the adapter
 * deletes them in every outcome, including errors and aborts.
 */
export class SonioxTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'soniox';
  readonly capabilities: TranscriptionCapabilities = {
    // Temporary API keys exist only for the WebSocket and TTS APIs, not the async file API.
    clientTokens: false,
    // Preflight from a foreign origin returns access-control-allow-origin: * and allows the
    // Authorization and Content-Type headers (checked 2026-11-13).
    browserDirect: true,
    // Soniox states no upload size limit (300 minutes per file, 10 GB total storage).
    maxChunkBytes: 100 * 1024 * 1024,
  };
  readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly opts: SonioxOptions) {
    if (!opts.apiKey) throw new DomainError('invalid', 'Soniox API key is required');
    this.model = opts.model ?? SONIOX_DEFAULT_MODEL;
    this.baseUrl = (opts.baseUrl ?? SONIOX_DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? defaultFetch;
  }

  private auth() {
    return { authorization: `Bearer ${this.opts.apiKey}` };
  }

  private async json<T>(path: string, init: RequestInit): Promise<T> {
    const res = await send(this.id, this.fetchImpl, `${this.baseUrl}${path}`, init);
    return readJson<T>(this.id, res);
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const signal = req.signal;
    const withSignal = (init: RequestInit): RequestInit => (signal ? { ...init, signal } : init);
    const form = new FormData();
    form.set('file', audioBlob(req.audio, req.mimeType), fileNameFor(req.mimeType));
    const file = await this.json<SonioxFile>(
      '/v1/files',
      withSignal({ method: 'POST', headers: this.auth(), body: form }),
    );
    let transcriptionId: string | null = null;
    try {
      const lang = baseLanguage(req.language);
      const created = await this.json<SonioxTranscription>(
        '/v1/transcriptions',
        withSignal({
          method: 'POST',
          headers: { ...this.auth(), 'content-type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            file_id: file.id,
            enable_speaker_diarization: true,
            enable_language_identification: true,
            ...(lang ? { language_hints: [lang] } : {}),
          }),
        }),
      );
      transcriptionId = created.id;
      const done = await this.waitFor(created, signal);
      const transcript = await this.json<SonioxTranscript>(
        `/v1/transcriptions/${encodeURIComponent(done.id)}/transcript`,
        withSignal({ method: 'GET', headers: this.auth() }),
      );
      return parseSoniox(transcript, done.audio_duration_ms ?? null, req.language);
    } finally {
      // Cleanup runs without the caller's signal so an abort still removes the audio.
      if (transcriptionId)
        await this.remove(`/v1/transcriptions/${encodeURIComponent(transcriptionId)}`);
      await this.remove(`/v1/files/${encodeURIComponent(file.id)}`);
    }
  }

  private async waitFor(
    t: SonioxTranscription,
    signal: AbortSignal | undefined,
  ): Promise<SonioxTranscription> {
    const interval = this.opts.pollIntervalMs ?? 1000;
    const deadline = Date.now() + (this.opts.timeoutMs ?? 10 * 60_000);
    let cur = t;
    while (cur.status !== 'completed') {
      if (cur.status === 'error') {
        throw new DomainError('provider_error', 'Transcription provider failed the job', {
          provider: this.id,
          error: cur.error_type ?? null,
        });
      }
      if (Date.now() > deadline) {
        throw new DomainError('provider_error', 'Transcription provider timed out', {
          provider: this.id,
        });
      }
      await sleep(interval, signal);
      cur = await this.json<SonioxTranscription>(
        `/v1/transcriptions/${encodeURIComponent(cur.id)}`,
        signal
          ? { method: 'GET', headers: this.auth(), signal }
          : { method: 'GET', headers: this.auth() },
      );
    }
    return cur;
  }

  private async remove(path: string): Promise<void> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'DELETE',
        headers: this.auth(),
      });
      await res.body?.cancel().catch(() => {});
    } catch {
      // Best effort: Soniox deletes leftovers after 30 days.
    }
  }

  async mintClientToken(): Promise<ClientToken> {
    throw new DomainError('unsupported', 'Soniox temporary keys do not cover the async file API');
  }

  healthCheck(): Promise<HealthResult> {
    return probe(this.fetchImpl, `${this.baseUrl}/v1/files?limit=1`, this.auth());
  }
}

export function parseSoniox(
  body: SonioxTranscript,
  durationMs: number | null,
  requested = 'auto',
): TranscribeResult {
  const tokens = (body.tokens ?? []).filter(
    (t) => t.translation_status !== 'translation' && typeof t.start_ms === 'number',
  );
  const segments = groupWords(
    tokens.map((t) => ({
      text: t.text,
      start: t.start_ms! / 1000,
      end: (t.end_ms ?? t.start_ms!) / 1000,
      speaker: t.speaker ?? null,
    })),
  );
  // Dominant language by token count.
  const counts = new Map<string, number>();
  for (const t of tokens) if (t.language) counts.set(t.language, (counts.get(t.language) ?? 0) + 1);
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    segments,
    language: normalizeLanguage(dominant) ?? baseLanguage(requested),
    durationSec: durationMs !== null ? durationMs / 1000 : (segments.at(-1)?.end ?? null),
  };
}
