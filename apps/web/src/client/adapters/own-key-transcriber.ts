import { IngestError } from '@askcalls/client-core/errors';
import type { Transcriber } from '@askcalls/client-core/ports/index';
import type { KeySession } from '@askcalls/client-core/session';
import type { UserDataDocs, UserDataStore } from '@askcalls/client-core/userdata';
import { DomainError, type TranscriptionProvider } from '@askcalls/domain';

export type OwnKey = Extract<UserDataDocs['providers']['transcription'], { mode: 'own' }>['key'];

/**
 * Provider adapters by id, imported only when own-key mode is used so none of them land in
 * the main bundle. Each runs the same isomorphic code as on the server, with the user's key.
 */
const PROVIDERS: Record<string, (k: OwnKey) => Promise<TranscriptionProvider>> = {
  elevenlabs: async (k) =>
    new (
      await import('@askcalls/adapter-transcription-elevenlabs')
    ).ElevenLabsTranscriptionProvider({
      apiKey: k.apiKey,
      ...(k.model && { model: k.model }),
      ...(k.baseUrl && { baseUrl: k.baseUrl }),
    }),
  openai: async (k) =>
    new (await import('@askcalls/adapter-transcription-openai')).OpenAiTranscriptionProvider({
      apiKey: k.apiKey,
      ...(k.model && { model: k.model }),
      ...(k.baseUrl && { baseUrl: k.baseUrl }),
    }),
  deepgram: async (k) =>
    new (await import('@askcalls/adapter-transcription-deepgram')).DeepgramTranscriptionProvider({
      apiKey: k.apiKey,
      ...(k.model && { model: k.model }),
      ...(k.baseUrl && { baseUrl: k.baseUrl }),
    }),
  soniox: async (k) =>
    new (await import('@askcalls/adapter-transcription-soniox')).SonioxTranscriptionProvider({
      apiKey: k.apiKey,
      ...(k.model && { model: k.model }),
      ...(k.baseUrl && { baseUrl: k.baseUrl }),
    }),
  'openai-compatible': async (k) => {
    if (!k.baseUrl)
      throw new DomainError('invalid', 'an OpenAI-compatible server needs a base URL');
    const m = await import('@askcalls/adapter-transcription-openai-compatible');
    return new m.OpenAiCompatibleTranscriptionProvider({
      baseUrl: k.baseUrl,
      apiKey: k.apiKey,
      ...(k.model && { model: k.model }),
      // The user chose to call their own server from this browser; its CORS is theirs to set.
      browserDirect: true,
    });
  },
};

export const OWN_KEY_TRANSCRIPTION_PROVIDERS = Object.keys(PROVIDERS);

/** The provider adapter for an own key, calling the provider straight from this browser. */
export async function ownKeyProvider(key: OwnKey): Promise<TranscriptionProvider> {
  const make = PROVIDERS[key.provider];
  if (!make) throw new DomainError('unsupported', 'unknown transcription provider');
  const provider = await make(key);
  if (!provider.capabilities.browserDirect) {
    throw new DomainError('unsupported', 'this provider does not accept browser requests');
  }
  return provider;
}

export function asTranscriber(provider: TranscriptionProvider): Transcriber {
  return {
    id: provider.id,
    maxChunkBytes: provider.capabilities.maxChunkBytes,
    async transcribe(chunk, { language }) {
      const r = await provider.transcribe({
        audio: chunk.bytes,
        mimeType: chunk.mimeType,
        language,
      });
      return { segments: r.segments, language: r.language, durationSec: r.durationSec };
    },
  };
}

/** Largest chunk the managed route accepts; own-key chunks use the same size. */
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * Follows Settings → Providers per chunk: managed goes through `/api/transcribe`, own key goes
 * straight to the provider, off fails the ingest with `transcription_unavailable`. The direct
 * provider (which holds the decrypted key) is cached until the session locks.
 */
export class SettingsTranscriber implements Transcriber {
  readonly id = 'settings';
  readonly maxChunkBytes = MAX_CHUNK_BYTES;
  #cached: { fingerprint: string; transcriber: Promise<Transcriber> } | null = null;

  constructor(
    private readonly userData: () => UserDataStore,
    private readonly managed: Transcriber,
    session: KeySession,
  ) {
    session.onWipe(() => {
      this.#cached = null;
    });
  }

  async transcribe(chunk: Parameters<Transcriber['transcribe']>[0], opts: { language: string }) {
    const { transcription } = await this.userData().get('providers');
    if (transcription.mode === 'off') {
      throw new IngestError('transcription_unavailable', 'transcription is off');
    }
    if (transcription.mode === 'managed') return this.managed.transcribe(chunk, opts);
    const t = await this.#direct(transcription.key).catch(() => {
      throw new IngestError('transcription_unavailable', 'own-key provider unavailable');
    });
    return t.transcribe(chunk, opts);
  }

  #direct(key: OwnKey): Promise<Transcriber> {
    const fingerprint = JSON.stringify([key.provider, key.apiKey, key.baseUrl, key.model]);
    if (this.#cached?.fingerprint !== fingerprint) {
      const transcriber = ownKeyProvider(key).then(asTranscriber);
      transcriber.catch(() => {
        if (this.#cached?.transcriber === transcriber) this.#cached = null;
      });
      this.#cached = { fingerprint, transcriber };
    }
    return this.#cached.transcriber;
  }
}
