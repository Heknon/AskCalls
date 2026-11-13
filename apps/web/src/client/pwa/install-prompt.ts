'use client';

import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState = 'unavailable' | 'available' | 'installed';

/**
 * The browser's install prompt, for Settings (spec 11.4). `state` is `available` once the
 * browser offers installation, `installed` when running as the installed app or after
 * accepting. `install()` shows the browser's dialog and resolves to whether it was accepted.
 */
export function useInstallPrompt(): { state: InstallState; install: () => Promise<boolean> } {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [state, setState] = useState<InstallState>('unavailable');

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) setState('installed');
    const offer = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setState('available');
    };
    const done = () => {
      setDeferred(null);
      setState('installed');
    };
    window.addEventListener('beforeinstallprompt', offer);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('beforeinstallprompt', offer);
      window.removeEventListener('appinstalled', done);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') setState('installed');
    return outcome === 'accepted';
  }, [deferred]);

  return { state, install };
}
