import type { ProviderInfo } from '@askcalls/domain';

/** Any server with OpenAI's transcription API, such as a local Whisper server. */
export const OPENAI_COMPATIBLE_TRANSCRIPTION_INFO: ProviderInfo = {
  id: 'openai-compatible',
  name: 'OpenAI-compatible',
  models: [],
  browserDirect: true,
  baseUrl: 'required',
  keyRequired: false,
};
