'use client';

import { useEffect, useState } from 'react';

/** Loads the harness API lazily (its own chunk) and exposes it to the Playwright driver. */
export function Harness() {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    import('./harness-api').then(
      (api) => {
        (window as unknown as { adapters: typeof api }).adapters = api;
        setState('ready');
      },
      () => setState('failed'),
    );
  }, []);
  return <main data-harness={state} />;
}
