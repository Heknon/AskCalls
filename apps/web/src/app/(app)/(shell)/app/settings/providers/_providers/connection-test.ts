import { type ApiClient, ApiError } from '@askcalls/api-contract';
import { ask, transcribe } from '@askcalls/api-contract/routes/providers';
import type {
  BucketConfig,
  BucketProbe,
} from '@askcalls/client-core/recording-stores/s3-compatible';
import type { Providers } from '@askcalls/client-core/userdata';
import { isDomainError } from '@askcalls/domain';
import { ownKeyProvider } from '../../../../../../../client/adapters/own-key-transcriber';

export type OwnKey = Extract<Providers['transcription'], { mode: 'own' }>['key'];

/**
 * Outcome of Test connection, as message keys: `ok` with the seconds it took, or one failure
 * line (spec S5 states). Never carries provider response text.
 */
export type TestOutcome =
  | { ok: true; ms: number }
  | {
      ok: false;
      reason:
        | 'key'
        | 'permission'
        | 'zeroRetention'
        | 'cors'
        | 'unreachable'
        | 'notFound'
        | 'quota'
        | 'http';
      status?: number;
    };

/** The adapter's content-free refusal reason (`details.reason`), as a test outcome. */
function refusalOutcome(
  details: Record<string, unknown>,
  status: number,
): Extract<TestOutcome, { ok: false }> | null {
  switch (details.reason) {
    case 'zero_retention_unavailable':
      return { ok: false, reason: 'zeroRetention', status };
    case 'missing_permission':
      return { ok: false, reason: 'permission', status };
    case 'invalid_key':
      return { ok: false, reason: 'key', status };
    default:
      return null;
  }
}

const SAMPLE_RATE = 16_000;
const SAMPLE_SECONDS = 3;

/** A 3-second 16 kHz mono WAV of a quiet 440 Hz tone, made on the device. */
export function sampleClip(): Uint8Array {
  const n = SAMPLE_RATE * SAMPLE_SECONDS;
  const out = new Uint8Array(44 + n * 2);
  const v = new DataView(out.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  text(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    v.setInt16(
      44 + i * 2,
      Math.round(Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * 3000),
      true,
    );
  }
  return out;
}

/** The one-line prompt for the ask test; no call content. */
export const SAMPLE_QUESTION = 'Reply with the single word OK.';
export const SAMPLE_TRANSCRIPT = 'Speaker 1: This is a connection test.';

function outcomeOf(e: unknown): TestOutcome {
  if (e instanceof ApiError) {
    if (e.code === 'quota_exceeded') return { ok: false, reason: 'quota' };
    const upstream = typeof e.details.status === 'number' ? e.details.status : e.status;
    return refusalOutcome(e.details, upstream) ?? { ok: false, reason: 'http', status: e.status };
  }
  if (isDomainError(e)) {
    const status = typeof e.details.status === 'number' ? e.details.status : null;
    const refused = status !== null ? refusalOutcome(e.details, status) : null;
    if (refused) return refused;
    if (status === 401 || status === 403) return { ok: false, reason: 'key', status };
    if (status === null && e.code === 'provider_error') return { ok: false, reason: 'unreachable' };
    if (status !== null) return { ok: false, reason: 'http', status };
  }
  if (e instanceof TypeError) return { ok: false, reason: 'unreachable' };
  return { ok: false, reason: 'http' };
}

async function timed(run: () => Promise<unknown>): Promise<TestOutcome> {
  const started = performance.now();
  try {
    await run();
    return { ok: true, ms: performance.now() - started };
  } catch (e) {
    return outcomeOf(e);
  }
}

/** Managed: the sample through `/api/transcribe`. Own key: straight to the provider. */
export function testTranscription(api: ApiClient, key: OwnKey | null): Promise<TestOutcome> {
  const audio = sampleClip();
  return timed(async () => {
    if (!key) {
      await api.request(transcribe, {
        query: { language: 'auto' },
        raw: { bytes: audio, contentType: 'audio/wav' },
      });
      return;
    }
    const provider = await ownKeyProvider(key);
    await provider.transcribe({ audio, mimeType: 'audio/wav', language: 'auto' });
  });
}

/**
 * Anthropic answers browser requests only with this header, which states that the key is the
 * user's own and used from their browser.
 */
const anthropicBrowserFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('anthropic-dangerous-direct-browser-access', 'true');
  return fetch(input, { ...init, headers });
};

/** Managed: one question through `/api/ask`. Own key: straight to the provider. */
export function testAsk(api: ApiClient, key: OwnKey | null): Promise<TestOutcome> {
  return timed(async () => {
    if (!key) {
      for await (const _ of api.stream(ask, {
        body: { question: SAMPLE_QUESTION, transcriptText: SAMPLE_TRANSCRIPT, consent: true },
      })) {
        // Drain the stream; the answer is not shown.
      }
      return;
    }
    const { AiSdkLlmProvider, isLlmProviderId } = await import('@askcalls/adapter-llm-ai-sdk');
    if (!isLlmProviderId(key.provider)) throw new TypeError('unknown provider');
    const llm = new AiSdkLlmProvider({
      provider: key.provider,
      ...(key.apiKey && { apiKey: key.apiKey }),
      ...(key.model && { model: key.model }),
      ...(key.baseUrl && { baseUrl: key.baseUrl }),
      maxOutputTokens: 16,
      fetch: key.provider === 'anthropic' ? anthropicBrowserFetch : (i, o) => fetch(i, o),
    });
    for await (const _ of llm.ask({
      question: SAMPLE_QUESTION,
      transcriptText: SAMPLE_TRANSCRIPT,
    })) {
      // Drain the stream; the answer is not shown.
    }
  });
}

export async function testBucket(
  probe: (b: BucketConfig) => Promise<BucketProbe>,
  bucket: BucketConfig,
): Promise<TestOutcome> {
  const started = performance.now();
  const r = await probe(bucket);
  if (r.ok) return { ok: true, ms: performance.now() - started };
  if (r.reason === 'cors_or_network') return { ok: false, reason: 'cors' };
  if (r.reason === 'unauthorized')
    return { ok: false, reason: 'key', ...(r.status && { status: r.status }) };
  if (r.reason === 'not_found') return { ok: false, reason: 'notFound', status: 404 };
  return { ok: false, reason: 'http', ...(r.status && { status: r.status }) };
}
