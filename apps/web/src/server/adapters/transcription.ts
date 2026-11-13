import { MockTranscriptionProvider } from '@askcalls/adapter-mocks';
import { DeepgramTranscriptionProvider } from '@askcalls/adapter-transcription-deepgram';
import { ElevenLabsTranscriptionProvider } from '@askcalls/adapter-transcription-elevenlabs';
import { OpenAiTranscriptionProvider } from '@askcalls/adapter-transcription-openai';
import { OpenAiCompatibleTranscriptionProvider } from '@askcalls/adapter-transcription-openai-compatible';
import { SonioxTranscriptionProvider } from '@askcalls/adapter-transcription-soniox';
import type { TranscriptionProvider } from '@askcalls/domain';
import type { InstanceConfig } from '../config/schema';
import { AdapterUnavailableError } from './errors';

function required(value: string | undefined, env: string, provider: string): string {
  if (!value) throw new Error(`${env}: required when TRANSCRIPTION_PROVIDER=${provider}`);
  return value;
}

/** TRANSCRIPTION_PROVIDER → adapter. `none` turns transcription off (null). */
export async function buildTranscription(
  config: InstanceConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<TranscriptionProvider | null> {
  const { provider, keys, baseUrl } = config.transcription;
  switch (provider) {
    case 'none':
      return null;
    case 'mock':
      return new MockTranscriptionProvider();
    case 'elevenlabs':
      return new ElevenLabsTranscriptionProvider({
        apiKey: required(keys.elevenlabs, 'ELEVENLABS_API_KEY', provider),
        fetch: fetchImpl,
      });
    case 'openai':
      return new OpenAiTranscriptionProvider({
        apiKey: required(keys.openai, 'OPENAI_API_KEY', provider),
        fetch: fetchImpl,
      });
    case 'deepgram':
      return new DeepgramTranscriptionProvider({
        apiKey: required(keys.deepgram, 'DEEPGRAM_API_KEY', provider),
        fetch: fetchImpl,
      });
    case 'soniox':
      return new SonioxTranscriptionProvider({
        apiKey: required(keys.soniox, 'SONIOX_API_KEY', provider),
        fetch: fetchImpl,
      });
    case 'openai-compatible':
      // No key slot exists for this provider in the config; local Whisper servers need none.
      return new OpenAiCompatibleTranscriptionProvider({
        baseUrl: required(baseUrl, 'TRANSCRIPTION_BASE_URL', provider),
        fetch: fetchImpl,
      });
    default:
      throw new AdapterUnavailableError('transcription', provider);
  }
}
