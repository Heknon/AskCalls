import type { ProviderInfo } from '@askcalls/domain';

export const SONIOX_INFO: ProviderInfo = {
  id: 'soniox',
  name: 'Soniox',
  models: [{ id: 'stt-async-v6', name: 'Async v6' }],
  browserDirect: true,
  baseUrl: 'fixed',
  keyRequired: true,
};
