import { DeepgramTranscriptionProvider } from '@askcalls/adapter-transcription-deepgram';
import { ElevenLabsTranscriptionProvider } from '@askcalls/adapter-transcription-elevenlabs';
import { OpenAiTranscriptionProvider } from '@askcalls/adapter-transcription-openai';
import { OpenAiCompatibleTranscriptionProvider } from '@askcalls/adapter-transcription-openai-compatible';
import { SonioxTranscriptionProvider } from '@askcalls/adapter-transcription-soniox';
import type { ApiClient } from '@askcalls/api-contract';
import { managedTranscriber, type Providers, type Transcriber } from '@askcalls/client-core';
import { DomainError, type TranscriptionProvider } from '@askcalls/domain';

type OwnKey = Extract<Providers['transcription'], { mode: 'own' }>['key'];

function provider(key: OwnKey): TranscriptionProvider {
  const opt = {
    apiKey: key.apiKey,
    ...(key.baseUrl && { baseUrl: key.baseUrl }),
    ...(key.model && { model: key.model }),
  };
  switch (key.provider) {
    case 'elevenlabs':
      return new ElevenLabsTranscriptionProvider(opt);
    case 'openai':
      return new OpenAiTranscriptionProvider(opt);
    case 'deepgram':
      return new DeepgramTranscriptionProvider(opt);
    case 'soniox':
      return new SonioxTranscriptionProvider(opt);
    case 'openai-compatible':
      if (!key.baseUrl) throw new DomainError('invalid', 'the speech server URL is missing');
      return new OpenAiCompatibleTranscriptionProvider({ ...opt, baseUrl: key.baseUrl });
    default:
      throw new DomainError('unsupported', 'unknown transcription provider', {
        provider: key.provider,
      });
  }
}

/** Own-key mode (spec 11.2a): audio goes from this computer straight to the user's provider. */
export function ownKeyTranscriber(key: OwnKey): Transcriber {
  const p = provider(key);
  return {
    id: `own:${p.id}`,
    maxChunkBytes: p.capabilities.maxChunkBytes,
    transcribe: (chunk, { language }) =>
      p.transcribe({ audio: chunk.bytes, mimeType: chunk.mimeType, language }),
  };
}

/** The transcriber Settings → Providers selects: managed (via the server), own key, or off. */
export function transcriberFor(
  api: ApiClient,
  setting: Providers['transcription'],
): Transcriber | null {
  if (setting.mode === 'off') return null;
  if (setting.mode === 'own') return ownKeyTranscriber(setting.key);
  return managedTranscriber(api);
}
