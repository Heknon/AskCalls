import { DomainError, type HealthResult } from '@askcalls/domain';

export type FetchLike = typeof fetch;

/** Wraps the global fetch so it is never called with a foreign `this` (browsers throw). */
export const defaultFetch: FetchLike = (input, init) => fetch(input, init);

/**
 * Why a provider refused a request, from a fixed set: never provider text.
 * - `invalid_key`: the key is unknown or revoked.
 * - `missing_permission`: the key exists but lacks the permission this request needs.
 * - `zero_retention_unavailable`: zero-retention mode was requested on a plan without it.
 */
export type RefusalReason = 'invalid_key' | 'missing_permission' | 'zero_retention_unavailable';

/**
 * Sends a request and returns the response when it is 2xx. Otherwise throws a content-free
 * DomainError carrying only the provider id, HTTP status and, when `refusal` maps a 401 or 403
 * to one, a `RefusalReason`. Any other body is discarded unread.
 */
export async function send(
  provider: string,
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  refusal?: (res: Response) => Promise<RefusalReason | undefined>,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new DomainError('provider_error', 'Transcription provider unreachable', {
      provider,
      status: null,
    });
  }
  if (res.ok) return res;
  const reason =
    refusal && (res.status === 401 || res.status === 403)
      ? await refusal(res).catch(() => undefined)
      : undefined;
  await res.body?.cancel().catch(() => {});
  throw new DomainError(
    res.status === 429 ? 'rate_limited' : 'provider_error',
    `Transcription provider returned HTTP ${res.status}`,
    { provider, status: res.status, ...(reason && { reason }) },
  );
}

export async function readJson<T>(provider: string, res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new DomainError('provider_error', 'Transcription provider sent an unreadable response', {
      provider,
      status: res.status,
    });
  }
}

/** Health from a cheap authenticated GET. Content-free messages. */
export async function probe(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
): Promise<HealthResult> {
  const started = Date.now();
  try {
    const res = await fetchImpl(url, { method: 'GET', headers });
    await res.body?.cancel().catch(() => {});
    const latencyMs = Date.now() - started;
    if (res.ok) return { ok: true, message: 'connected', latencyMs };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'invalid API key', latencyMs };
    }
    return { ok: false, message: `HTTP ${res.status}`, latencyMs };
  } catch {
    return { ok: false, message: 'unreachable', latencyMs: Date.now() - started };
  }
}

/** File name with an extension the provider can sniff, from a MIME type. */
export function fileNameFor(mimeType: string): string {
  const base = mimeType.split(';')[0]!.trim().toLowerCase();
  const ext: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/opus': 'ogg',
    'audio/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  };
  return `audio.${ext[base] ?? 'bin'}`;
}

/** `he-IL` → `he`; `auto` → null. */
export function baseLanguage(language: string): string | null {
  if (!language || language === 'auto') return null;
  return language.split(/[-_]/)[0]!.toLowerCase();
}

const ISO3_TO_1: Record<string, string> = {
  eng: 'en',
  heb: 'he',
  ara: 'ar',
  rus: 'ru',
  fra: 'fr',
  deu: 'de',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  ukr: 'uk',
  tur: 'tr',
  amh: 'am',
  yid: 'yi',
};

/** Whisper's verbose_json reports language names. */
const NAME_TO_1: Record<string, string> = {
  english: 'en',
  hebrew: 'he',
  arabic: 'ar',
  russian: 'ru',
  french: 'fr',
  german: 'de',
  spanish: 'es',
  italian: 'it',
  portuguese: 'pt',
  ukrainian: 'uk',
  turkish: 'tr',
  amharic: 'am',
  yiddish: 'yi',
};

/**
 * Normalizes a provider language (ISO 639-1/-3 code or English name) to a BCP-47 primary
 * subtag where the mapping is known; otherwise returns it lower-cased.
 */
export function normalizeLanguage(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toLowerCase();
  return ISO3_TO_1[c] ?? NAME_TO_1[c] ?? c;
}

/** Copies bytes into a Blob (FormData needs a Blob; a fresh ArrayBuffer avoids shared views). */
export function audioBlob(audio: Uint8Array, mimeType: string): Blob {
  return new Blob([new Uint8Array(audio)], { type: mimeType });
}
