'use client';

import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { GateHeading } from '@askcalls/ui/components/Gate';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

/**
 * Local mode (spec 11.2c): `askcalls local` opens `/login#key=<key>`. The fragment never reaches
 * the server's logs or a Referer; it is read here, removed from the address bar and history, and
 * posted once to the `local` sign-in. Without a key the page says how to start AskCalls.
 */
export function ThisComputerSignIn({
  action,
  redirectTo,
  failed,
}: {
  action: (formData: FormData) => Promise<void>;
  redirectTo: string;
  failed: boolean;
}) {
  const t = useTranslations('auth.thisComputer');
  const form = useRef<HTMLFormElement>(null);
  const keyInput = useRef<HTMLInputElement>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const key = new URLSearchParams(window.location.hash.slice(1)).get('key');
    if (!window.location.hash) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    if (!key || !form.current || !keyInput.current) return;
    keyInput.current.value = key;
    setSigningIn(true);
    form.current.requestSubmit();
  }, []);

  return (
    <>
      <GateHeading
        title={t(signingIn ? 'signingIn' : 'title')}
        description={signingIn ? null : <p>{t('body')}</p>}
      />
      {failed && !signingIn ? <ErrorState scope="panel" title={t('expired')} /> : null}
      <form ref={form} action={action} hidden>
        <input ref={keyInput} type="hidden" name="key" />
        <input type="hidden" name="redirectTo" value={redirectTo} />
      </form>
    </>
  );
}
