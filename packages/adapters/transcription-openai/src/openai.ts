import type {
  ClientToken,
  HealthResult,
  TranscribeRequest,
  TranscribeResult,
  TranscriptionCapabilities,
  TranscriptionProvider,
  TranscriptSegment,
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
import { SpeakerLabels } from './segments';

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
/**
 * Default model. Of the gpt-4o transcription family only `gpt-4o-transcribe-diarize` returns
 * timestamps (and speakers), via `diarized_json`; `gpt-4o-transcribe` and
 * `gpt-4o-mini-transcribe` support `json` only (text, no timestamps). OpenAI lists the diarize
 * model as deprecated with shutdown on 2027-02-26; switch `model` to `whisper-1` (timed segments,
 * no speakers) or a successor before then.
 */
export const OPENAI_DEFAULT_MODEL = 'gpt-4o-transcribe-diarize';

export interface OpenAiTranscriptionOptions {
  apiKey: string;
  model?: string;
  /** Default `https://api.openai.com/v1`. */
  baseUrl?: string;
  fetch?: FetchLike;
}

/** How a model answers: which `response_format` it supports and what it returns. */
export type OpenAiResponseMode = 'diarized_json' | 'verbose_json' | 'json';

export function responseModeFor(model: string): OpenAiResponseMode {
  if (model.includes('diarize')) return 'diarized_json';
  if (model.startsWith('whisper')) return 'verbose_json';
  return 'json';
}

export interface OpenAiDiarized {
  task?: 'transcribe';
  duration?: number;
  text: string;
  segments: Array<{ id?: string; start: number; end: number; text: string; speaker?: string }>;
  usage?: { type: 'duration'; seconds: number } | { type: 'tokens' };
}

export interface OpenAiVerbose {
  language?: string;
  duration?: number;
  text: string;
  segments?: Array<{ id?: number; start: number; end: number; text: string }>;
}

export interface OpenAiJson {
  text: string;
  languages?: Array<{ code: string }>;
  usage?: { type: 'duration'; seconds: number } | { type: 'tokens' };
}

/**
 * OpenAI speech-to-text (POST /v1/audio/transcriptions). OpenAI has no per-request retention
 * flag for this endpoint: API data isn't used for training by default, and zero data retention
 * is an account-level agreement.
 */
export class OpenAiTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'openai';
  readonly capabilities: TranscriptionCapabilities = {
    // OpenAI's ephemeral client secrets cover Realtime sessions only, not file transcription.
    clientTokens: false,
    // Preflight from a foreign origin answers with that origin and allows authorization and
    // content-type (checked 2026-11-13).
    browserDirect: true,
    // Uploads are limited to 25 MB (speech-to-text guide).
    maxChunkBytes: 25_000_000,
  };
  readonly model: string;
  readonly mode: OpenAiResponseMode;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly opts: OpenAiTranscriptionOptions) {
    if (!opts.apiKey) throw new DomainError('invalid', 'OpenAI API key is required');
    this.model = opts.model ?? OPENAI_DEFAULT_MODEL;
    this.mode = responseModeFor(this.model);
    this.baseUrl = (opts.baseUrl ?? OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? defaultFetch;
  }

  get endpoint(): string {
    return `${this.baseUrl}/audio/transcriptions`;
  }

  buildForm(req: Pick<TranscribeRequest, 'audio' | 'mimeType' | 'language'>): FormData {
    const form = new FormData();
    form.set('file', audioBlob(req.audio, req.mimeType), fileNameFor(req.mimeType));
    form.set('model', this.model);
    form.set('response_format', this.mode);
    if (this.mode === 'diarized_json') form.set('chunking_strategy', 'auto');
    if (this.mode === 'verbose_json') form.append('timestamp_granularities[]', 'segment');
    const lang = baseLanguage(req.language);
    if (lang) form.set('language', lang);
    return form;
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const res = await send(this.id, this.fetchImpl, this.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.opts.apiKey}`, accept: 'application/json' },
      body: this.buildForm(req),
      ...(req.signal ? { signal: req.signal } : {}),
    });
    const body = await readJson<OpenAiDiarized & OpenAiVerbose & OpenAiJson>(this.id, res);
    return parseOpenAi(body, this.mode, req.language);
  }

  async mintClientToken(): Promise<ClientToken> {
    throw new DomainError('unsupported', 'OpenAI has no client tokens for file transcription');
  }

  healthCheck(): Promise<HealthResult> {
    return probe(this.fetchImpl, `${this.baseUrl}/models`, {
      authorization: `Bearer ${this.opts.apiKey}`,
    });
  }
}

const clean = (t: string) => t.replace(/\s+/g, ' ').trim();

export function parseOpenAi(
  body: OpenAiDiarized | OpenAiVerbose | OpenAiJson,
  mode: OpenAiResponseMode,
  requested = 'auto',
): TranscribeResult {
  const requestedLang = baseLanguage(requested);
  if (mode === 'diarized_json') {
    const b = body as OpenAiDiarized;
    const labels = new SpeakerLabels();
    const segments: TranscriptSegment[] = (b.segments ?? [])
      .filter((s) => clean(s.text))
      .sort((x, y) => x.start - y.start)
      .map((s) => {
        const speaker = labels.label(s.speaker);
        return {
          start: s.start,
          end: Math.max(s.end, s.start),
          ...(speaker ? { speaker } : {}),
          text: clean(s.text),
        };
      });
    return { segments, language: requestedLang, durationSec: b.duration ?? null };
  }
  if (mode === 'verbose_json') {
    const b = body as OpenAiVerbose;
    const segments = (b.segments ?? [])
      .filter((s) => clean(s.text))
      .sort((x, y) => x.start - y.start)
      .map((s) => ({ start: s.start, end: Math.max(s.end, s.start), text: clean(s.text) }));
    return {
      segments,
      language: normalizeLanguage(b.language) ?? requestedLang,
      durationSec: b.duration ?? null,
    };
  }
  // json: text only. One untimed segment spanning the chunk when the duration is known.
  const b = body as OpenAiJson;
  const durationSec = b.usage?.type === 'duration' ? b.usage.seconds : null;
  const text = clean(b.text ?? '');
  return {
    segments: text ? [{ start: 0, end: durationSec ?? 0, text }] : [],
    language: normalizeLanguage(b.languages?.[0]?.code) ?? requestedLang,
    durationSec,
  };
}
