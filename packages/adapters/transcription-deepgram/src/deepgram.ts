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
import { baseLanguage, defaultFetch, type FetchLike, probe, readJson, send } from './http';
import { groupWords, SpeakerLabels } from './segments';

export const DEEPGRAM_DEFAULT_BASE_URL = 'https://api.deepgram.com';
export const DEEPGRAM_DEFAULT_MODEL = 'nova-3';

export interface DeepgramOptions {
  apiKey: string;
  /** `nova-3` (default; the only Nova model with Hebrew). */
  model?: string;
  baseUrl?: string;
  /**
   * Opt out of Deepgram's Model Improvement Program (`mip_opt_out=true`): audio is kept only for
   * the duration of the request. Default true. Deepgram prices opted-out requests higher.
   */
  mipOptOut?: boolean;
  fetch?: FetchLike;
}

interface DeepgramWord {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  speaker?: number;
}

/** Response of POST /v1/listen (pre-recorded). */
export interface DeepgramResponse {
  metadata?: { duration?: number; request_id?: string };
  results: {
    channels: Array<{
      alternatives: Array<{ transcript: string; words?: DeepgramWord[] }>;
      detected_language?: string;
    }>;
    utterances?: Array<{
      start: number;
      end: number;
      transcript: string;
      speaker?: number;
      channel?: number;
    }>;
  };
}

/**
 * Deepgram pre-recorded speech-to-text: the audio is the raw request body, options are query
 * parameters (diarization with `diarize_model=latest`, `utterances`, `smart_format`,
 * `mip_opt_out`).
 */
export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'deepgram';
  readonly capabilities: TranscriptionCapabilities = {
    // POST /v1/auth/grant issues JWTs valid for a time window (default 30 s), not single-use, so
    // they can't bound a client to one request or to the server's minute quota.
    clientTokens: false,
    // Preflight from a foreign origin answers with that origin and allows the authorization and
    // content-type headers (checked 2026-11-13).
    browserDirect: true,
    // Deepgram documents no upload size limit; requests that process for over 10 minutes fail
    // with 504. Chunks are capped well below that.
    maxChunkBytes: 100 * 1024 * 1024,
  };
  readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly opts: DeepgramOptions) {
    if (!opts.apiKey) throw new DomainError('invalid', 'Deepgram API key is required');
    this.model = opts.model ?? DEEPGRAM_DEFAULT_MODEL;
    this.baseUrl = (opts.baseUrl ?? DEEPGRAM_DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? defaultFetch;
  }

  /** The request URL for a language hint. Direct-mode and own-key clients use the same URL. */
  listenUrl(language: string): string {
    const q = new URLSearchParams({
      model: this.model,
      smart_format: 'true',
      punctuate: 'true',
      utterances: 'true',
      diarize_model: 'latest',
    });
    const lang = baseLanguage(language);
    if (lang) q.set('language', lang);
    else q.set('detect_language', 'true');
    if (this.opts.mipOptOut ?? true) q.set('mip_opt_out', 'true');
    return `${this.baseUrl}/v1/listen?${q}`;
  }

  async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
    const res = await send(this.id, this.fetchImpl, this.listenUrl(req.language), {
      method: 'POST',
      headers: {
        authorization: `Token ${this.opts.apiKey}`,
        'content-type': req.mimeType,
        accept: 'application/json',
      },
      body: new Uint8Array(req.audio),
      ...(req.signal ? { signal: req.signal } : {}),
    });
    return parseDeepgram(await readJson<DeepgramResponse>(this.id, res), req.language);
  }

  async mintClientToken(): Promise<ClientToken> {
    throw new DomainError(
      'unsupported',
      'Deepgram has no single-use tokens for pre-recorded audio',
    );
  }

  healthCheck(): Promise<HealthResult> {
    return probe(this.fetchImpl, `${this.baseUrl}/v1/auth/token`, {
      authorization: `Token ${this.opts.apiKey}`,
    });
  }
}

export function parseDeepgram(body: DeepgramResponse, requested = 'auto'): TranscribeResult {
  const channel = body.results?.channels?.[0];
  const labels = new SpeakerLabels();
  let segments: TranscriptSegment[];
  const utterances = (body.results?.utterances ?? []).filter((u) => (u.channel ?? 0) === 0);
  if (utterances.length) {
    segments = utterances
      .filter((u) => u.transcript.trim())
      .sort((a, b) => a.start - b.start)
      .map((u) => {
        const speaker = labels.label(u.speaker === undefined ? null : String(u.speaker));
        return {
          start: u.start,
          end: Math.max(u.end, u.start),
          ...(speaker ? { speaker } : {}),
          text: u.transcript.trim(),
        };
      });
  } else {
    const words = channel?.alternatives?.[0]?.words ?? [];
    segments = groupWords(
      words.map((w) => ({
        text: `${w.punctuated_word ?? w.word} `,
        start: w.start,
        end: w.end,
        speaker: w.speaker === undefined ? null : String(w.speaker),
      })),
    );
  }
  return {
    segments,
    language: channel?.detected_language ?? baseLanguage(requested),
    durationSec: body.metadata?.duration ?? segments.at(-1)?.end ?? null,
  };
}
