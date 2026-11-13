import type { ResponseFor } from '@askcalls/api-contract/client';
import type { listKeyring } from '@askcalls/api-contract/routes/keyring';

export type Keyring = ResponseFor<typeof listKeyring>;
export type KeyringEntry = Keyring['entries'][number];

export const activeOf = (k: Keyring, kind: KeyringEntry['kind']) =>
  k.entries.filter((e) => e.kind === kind && e.revokedAt === null);
