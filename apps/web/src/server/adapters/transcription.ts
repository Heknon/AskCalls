import { MockTranscriptionProvider } from '@askcalls/adapter-mocks';
import type { TranscriptionProvider } from '@askcalls/domain';
import type { InstanceConfig } from '../config/schema';
import { AdapterUnavailableError } from './errors';

/** TRANSCRIPTION_PROVIDER → adapter. `none` turns transcription off (null). */
export async function buildTranscription(
  config: InstanceConfig,
): Promise<TranscriptionProvider | null> {
  switch (config.transcription.provider) {
    case 'none':
      return null;
    case 'mock':
      return new MockTranscriptionProvider();
    default:
      throw new AdapterUnavailableError('transcription', config.transcription.provider);
  }
}
