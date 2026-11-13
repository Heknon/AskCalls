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

/**
 * TRANSCRIPTION_PROVIDER → adapter. `none`, or a keyed provider without its API key, turns
 * managed transcription off (null); users can still transcribe with their own key.
 */
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
      return keys.elevenlabs
        ? new ElevenLabsTranscriptionProvider({ apiKey: keys.elevenlabs, fetch: fetchImpl })
        : null;
    case 'openai':
      return keys.openai
        ? new OpenAiTranscriptionProvider({ apiKey: keys.openai, fetch: fetchImpl })
        : null;
    case 'deepgram':
      return keys.deepgram
        ? new DeepgramTranscriptionProvider({ apiKey: keys.deepgram, fetch: fetchImpl })
        : null;
    case 'soniox':
      return keys.soniox
        ? new SonioxTranscriptionProvider({ apiKey: keys.soniox, fetch: fetchImpl })
        : null;
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
