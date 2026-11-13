'use client';

import type { Providers } from '@askcalls/client-core/userdata';
import { useCallback } from 'react';
import { useUnlocked } from '../../../../../../../client/session/session';

export type SaveResult = { reloading: true } | { reloading: false; doc: Providers };

/**
 * Writes the providers document, then mirrors the direct origins into the CSP cookie. When
 * this page's CSP would block a newly needed origin, the page reloads (and the gate asks to
 * unlock again).
 */
export function useSaveProviders() {
  const { client, ctx } = useUnlocked();
  return useCallback(
    async (mutate: (p: Providers) => Providers): Promise<SaveResult> => {
      const doc = await ctx.userData.update('providers', mutate);
      const { stale } = await client.syncDirectAccess();
      if (stale) {
        window.location.reload();
        return { reloading: true };
      }
      return { reloading: false, doc };
    },
    [client, ctx],
  );
}

/** "sk-ant-" and "4f20" of a saved key, for `MaskedSecret`. */
export function maskParts(secret: string): { prefix: string; last4: string } {
  const prefix = /^[A-Za-z]{2,5}[-_](?:[A-Za-z]{2,5}[-_])?/.exec(secret)?.[0] ?? '';
  return { prefix: secret.length > prefix.length + 8 ? prefix : '', last4: secret.slice(-4) };
}
