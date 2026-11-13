import type { ProviderInfo } from '@askcalls/domain';

export const ELEVENLABS_INFO: ProviderInfo = {
  id: 'elevenlabs',
  name: 'ElevenLabs',
  models: [
    { id: 'scribe_v2', name: 'Scribe v2' },
    { id: 'scribe_v1', name: 'Scribe v1' },
  ],
  browserDirect: true,
  baseUrl: 'fixed',
  keyRequired: true,
};
