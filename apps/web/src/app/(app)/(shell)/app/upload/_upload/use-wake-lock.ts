'use client';

import { useEffect } from 'react';

type WakeLock = { release(): Promise<void> };
type WakeLockApi = { request(type: 'screen'): Promise<WakeLock> };

/**
 * Keeps the screen on while `active`: a phone that locks pauses the tab, and the import with it.
 * The browser drops the lock whenever the page is hidden, so it is asked for again on return.
 * Where the API is missing or refuses, nothing happens.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!active || !api) return;
    let lock: WakeLock | null = null;
    let stopped = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      api.request('screen').then(
        (l) => {
          if (stopped) void l.release().catch(() => {});
          else lock = l;
        },
        () => {},
      );
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
