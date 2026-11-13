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
import { groupWords, type TimedWord } from './segments';

export const ELEVENLABS_DEFAULT_BASE_URL = 'https://api.elevenlabs.io';
export const ELEVENLABS_DEFAULT_MODEL = 'scribe_v2';

export interface ElevenLabsOptions {
  apiKey: string;
  /** `scribe_v2` (default). */
  model?: string;
  /**
   * API origin. Default `https://api.elevenlabs.io`; data-residency workspaces use e.g.
   * `https://api.eu.residency.elevenlabs.io`.
   */
  baseUrl?: string;
  fetch?: FetchLike;
}

/** Response of POST /v1/speech-to-text (single channel). */
export interface ElevenLabsTranscript {
  language_code: string;
  language_probability: number;
  text: string;
  words: Array<{
    text: string;
    start?: number | null;
    end?: number | null;
    type: 'word' | 'spacing' | 'audio_event';
    speaker_id?: string | null;
    logprob?: number;
  }>;
  audio_duration_secs?: number;
  transcription_id?: string;
}

/** Single-use tokens expire 15 minutes after minting (ElevenLabs docs). */
const TOKEN_TTL_MS = 15 * 60_000;

/**
 * ElevenLabs Scribe batch speech-to-text.
 *
 * Every request carries `enable_logging=false` (zero retention; honored only for workspaces with
 * Zero Retention Mode, an Enterprise feature), diarization and word timestamps. Audio is sent as
 * multipart and never stored or logged here.
 */
export class ElevenLabsTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'elevenlabs';
  readonly capabilities: TranscriptionCapabilities = {
    // POST /v1/single-use-token/batch_scribe mints 15-minute single-use tokens for this API.
    clientTokens: true,
    // Preflight from a foreign origin returns access-control-allow-origin: * and
    // access-control-allow-headers: * (checked 2026-11-13).
    browserDirect: true,
    // The file upload must be under 5.0 GB (API reference).
    maxChunkBytes: 5_000_000_000,
  };
  readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly opts: ElevenLabsOptions) {
    if (!opts.apiKey) throw new DomainError('invalid', 'ElevenLabs API key is required');
    this.model = opts.model ?? ELEVENLABS_DEFAULT_MODEL;
    this.baseUrl = (opts.baseUrl ?? ELEVENLABS_DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? defaultFetch;
  }

  /** The batch endpoint, always with logging off. Direct-mode clients append `&token=…`. */
  get endpoint(): string {
    return `${this.baseUrl}/v1/speech-to-text?enable_logging=false`;
  }

  /** Multipart body for one chunk. Exported shape so direct-mode clients send the same fields. */
  buildForm(req: Pick<TranscribeRequest, 'audio' | 'mimeType' | 'language'>): FormData {
    const form = new FormData();
    form.set('model_id', this.model);
    form.set('file', audioBlob(req.audio, req.mimeType), fileNameFor(req.mimeType));
    form.set('diarize', 'true');
    form.set('timestamps_granularity', 'word');
    form.set('tag_audio_events', 'false');
    form.set('file_format', 'other');
    const lang = baseLanguage(req.language);
    if (lang) form.set('language_code', lang);
    return form;
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const res = await send(this.id, this.fetchImpl, this.endpoint, {
      method: 'POST',
      headers: { 'xi-api-key': this.opts.apiKey, accept: 'application/json' },
      body: this.buildForm(req),
      ...(req.signal ? { signal: req.signal } : {}),
    });
    return parseElevenLabs(await readJson<ElevenLabsTranscript>(this.id, res));
  }

  async mintClientToken(): Promise<ClientToken> {
    const res = await send(
      this.id,
      this.fetchImpl,
      `${this.baseUrl}/v1/single-use-token/batch_scribe`,
      { method: 'POST', headers: { 'xi-api-key': this.opts.apiKey } },
    );
    const body = await readJson<{ token?: string }>(this.id, res);
    if (!body.token) {
      throw new DomainError('provider_error', 'Transcription provider returned no token', {
        provider: this.id,
      });
    }
    return {
      token: body.token,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      endpoint: this.endpoint,
    };
  }

  healthCheck(): Promise<HealthResult> {
    return probe(this.fetchImpl, `${this.baseUrl}/v1/models`, { 'xi-api-key': this.opts.apiKey });
  }
}

export function parseElevenLabs(body: ElevenLabsTranscript): TranscribeResult {
  const words: TimedWord[] = [];
  for (const w of body.words ?? []) {
    if (w.type === 'audio_event') continue;
    if (w.type === 'spacing') {
      words.push({ text: w.text, start: w.start ?? 0, end: w.end ?? 0, speaker: w.speaker_id });
      continue;
    }
    if (typeof w.start !== 'number' || typeof w.end !== 'number') continue;
    words.push({ text: w.text, start: w.start, end: w.end, speaker: w.speaker_id });
  }
  const segments = groupWords(words);
  if (!segments.length && body.text?.trim()) {
    const end = body.audio_duration_secs ?? 0;
    segments.push({ start: 0, end, text: body.text.trim() });
  }
  return {
    segments,
    language: normalizeLanguage(body.language_code),
    durationSec: body.audio_duration_secs ?? segments.at(-1)?.end ?? null,
  };
}
