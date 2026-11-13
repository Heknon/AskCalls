import type { ProviderInfo } from '@askcalls/domain';

export const DEEPGRAM_INFO: ProviderInfo = {
  id: 'deepgram',
  name: 'Deepgram',
  models: [{ id: 'nova-3', name: 'Nova-3' }],
  browserDirect: true,
  baseUrl: 'fixed',
  keyRequired: true,
};
