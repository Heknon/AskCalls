'use client';

import { Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { useNotify } from '../../../client/notices/notices';
import { useAppSession } from '../../../client/session/session';

/**
 * Local mode, while `askcalls local` waits to be linked: on the first unlock of this page load,
 * links it (client/local-agent-link.ts) and says so.
 */
export function LocalAgentLink({ url }: { url: string }) {
  const t = useTranslations('shell.toast.agent');
  const { status, client } = useAppSession();
  const notify = useNotify();
  const started = useRef(false);

  useEffect(() => {
    if (status !== 'unlocked' || !client || started.current) return;
    started.current = true;
    const failed = () => notify({ kind: 'error', title: t('failed') });
    import('../../../client/local-agent-link')
      .then(({ linkLocalAgent }) =>
        linkLocalAgent({ url, api: client.api, session: client.session }),
      )
      .then((r) => {
        if (r === 'linked') notify({ kind: 'event', icon: Bot, title: t('linked') });
        else if (r === 'mismatch') failed();
      }, failed);
  }, [status, client, url, notify, t]);

  return null;
}
