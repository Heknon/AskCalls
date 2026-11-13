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
  readJson,
  send,
} from './http';
import { groupWords } from './segments';

export const COMPATIBLE_DEFAULT_MODEL = 'whisper-1';

export interface OpenAiCompatibleOptions {
  /**
   * Server URL: an origin (`http://localhost:8000`), its `/v1` root, or the full
   * `/v1/audio/transcriptions` URL.
   */
  baseUrl: string;
  /** Sent as `Authorization: Bearer` when set; local servers usually need none. */
  apiKey?: string;
  /** Model name the server expects, e.g. `Systran/faster-whisper-large-v3`. Default `whisper-1`. */
  model?: string;
  /**
   * Whether the server answers CORS preflights from the app origin (speaches/faster-whisper-server
   * allows all origins by default; whisper.cpp's server does not). Default false.
   */
  browserDirect?: boolean;
  /** Largest upload the server accepts. Default 25 MB, as OpenAI's API. */
  maxChunkBytes?: number;
  fetch?: FetchLike;
}

interface VerboseJson {
  language?: string;
  duration?: number;
  text?: string;
  segments?: Array<{ start: number; end: number; text: string }>;
  words?: Array<{ start: number; end: number; word: string }>;
}

/** Resolves the transcription URL from any of the accepted base URL forms. */
export function transcriptionsUrl(baseUrl: string): string {
  const u = baseUrl.replace(/\/+$/, '');
  if (u.endsWith('/audio/transcriptions')) return u;
  if (/\/v\d+$/.test(u)) return `${u}/audio/transcriptions`;
  return `${u}/v1/audio/transcriptions`;
}

/**
 * Any server that implements OpenAI's `POST /v1/audio/transcriptions` with Whisper's
 * `verbose_json` (segment timestamps): faster-whisper-server/speaches, whisper.cpp's server
 * (started with `--inference-path /v1/audio/transcriptions`), LocalAI, vLLM, Groq and others.
 */
export class OpenAiCompatibleTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'openai-compatible';
  readonly capabilities: TranscriptionCapabilities;
  readonly model: string;
  readonly endpoint: string;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly opts: OpenAiCompatibleOptions) {
    if (!opts.baseUrl) throw new DomainError('invalid', 'Transcription base URL is required');
    try {
      new URL(opts.baseUrl);
    } catch {
      throw new DomainError('invalid', 'Transcription base URL is not a URL');
    }
    this.endpoint = transcriptionsUrl(opts.baseUrl);
    this.model = opts.model ?? COMPATIBLE_DEFAULT_MODEL;
    this.fetchImpl = opts.fetch ?? defaultFetch;
    this.capabilities = {
      clientTokens: false,
      browserDirect: opts.browserDirect ?? false,
      maxChunkBytes: opts.maxChunkBytes ?? 25_000_000,
    };
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { accept: 'application/json' };
    if (this.opts.apiKey) h.authorization = `Bearer ${this.opts.apiKey}`;
    return h;
  }

  buildForm(req: Pick<TranscribeRequest, 'audio' | 'mimeType' | 'language'>): FormData {
    const form = new FormData();
    form.set('file', audioBlob(req.audio, req.mimeType), fileNameFor(req.mimeType));
    form.set('model', this.model);
    form.set('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    const lang = baseLanguage(req.language);
    if (lang) form.set('language', lang);
    return form;
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const res = await send(this.id, this.fetchImpl, this.endpoint, {
      method: 'POST',
      headers: this.headers(),
      body: this.buildForm(req),
      ...(req.signal ? { signal: req.signal } : {}),
    });
    return parseVerboseJson(await readJson<VerboseJson>(this.id, res), req.language);
  }

  async mintClientToken(): Promise<ClientToken> {
    throw new DomainError('unsupported', 'OpenAI-compatible servers have no client tokens');
  }

  /** GET <root>/v1/models. Servers without it (whisper.cpp) answer 404, which still proves reachability. */
  async healthCheck(): Promise<HealthResult> {
    const started = Date.now();
    const url = this.endpoint.replace(/\/audio\/transcriptions$/, '/models');
    try {
      const res = await this.fetchImpl(url, { method: 'GET', headers: this.headers() });
      await res.body?.cancel().catch(() => {});
      const latencyMs = Date.now() - started;
      if (res.ok) return { ok: true, message: 'connected', latencyMs };
      if (res.status === 404 || res.status === 405)
        return { ok: true, message: 'reachable', latencyMs };
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: 'invalid API key', latencyMs };
      }
      return { ok: false, message: `HTTP ${res.status}`, latencyMs };
    } catch {
      return { ok: false, message: 'unreachable', latencyMs: Date.now() - started };
    }
  }
}

const clean = (t: string) => t.replace(/\s+/g, ' ').trim();

export function parseVerboseJson(body: VerboseJson, requested = 'auto'): TranscribeResult {
  let segments = (body.segments ?? [])
    .filter((s) => clean(s.text))
    .sort((a, b) => a.start - b.start)
    .map((s) => ({ start: s.start, end: Math.max(s.end, s.start), text: clean(s.text) }));
  if (!segments.length && body.words?.length) {
    segments = groupWords(body.words.map((w) => ({ text: w.word, start: w.start, end: w.end })));
  }
  if (!segments.length && body.text && clean(body.text)) {
    segments = [{ start: 0, end: body.duration ?? 0, text: clean(body.text) }];
  }
  return {
    segments,
    language: normalizeLanguage(body.language) ?? baseLanguage(requested),
    durationSec: body.duration ?? segments.at(-1)?.end ?? null,
  };
}
