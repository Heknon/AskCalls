import type { ProviderInfo } from '@askcalls/domain';

export const OPENAI_TRANSCRIPTION_INFO: ProviderInfo = {
  id: 'openai',
  name: 'OpenAI',
  models: [
    { id: 'gpt-4o-transcribe-diarize', name: 'GPT-4o Transcribe (speakers)' },
    { id: 'gpt-4o-transcribe', name: 'GPT-4o Transcribe' },
    { id: 'gpt-4o-mini-transcribe', name: 'GPT-4o mini Transcribe' },
    { id: 'whisper-1', name: 'Whisper' },
  ],
  browserDirect: true,
  baseUrl: 'fixed',
  keyRequired: true,
};
