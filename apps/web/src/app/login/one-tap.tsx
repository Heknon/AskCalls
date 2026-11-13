'use client';

import { signIn } from 'next-auth/react';
import { useEffect } from 'react';

interface GoogleId {
  initialize(opts: {
    client_id: string;
    callback: (r: { credential: string }) => void;
    use_fedcm_for_prompt?: boolean;
  }): void;
  prompt(): void;
}

const SCRIPT = 'https://accounts.google.com/gsi/client';

/** Google One Tap (spec 2.4: its script loads on / and /login only, never on /app). */
export function OneTap({ clientId, redirectTo }: { clientId: string; redirectTo: string }) {
  useEffect(() => {
    const start = () => {
      const id = (window as { google?: { accounts: { id: GoogleId } } }).google?.accounts.id;
      if (!id) return;
      id.initialize({
        client_id: clientId,
        use_fedcm_for_prompt: true,
        callback: ({ credential }) => void signIn('google-one-tap', { credential, redirectTo }),
      });
      id.prompt();
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (existing) {
      start();
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = start;
    document.head.appendChild(s);
  }, [clientId, redirectTo]);
  return null;
}
