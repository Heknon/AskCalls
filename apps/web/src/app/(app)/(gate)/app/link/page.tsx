'use client';

import { Button } from '@askcalls/ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { LanguageControl } from '../../../../../client/i18n/language-switcher';
import { useAppSession } from '../../../../../client/session/session';
import { GateFrame } from '../../../../_gate/gate-frame';
import { LinkFlow } from './_link/link-flow';

/**
 * /app/link: a new browser joins with a link code from an unlocked device (spec 6.5). Signed in
 * but outside the unlock gate, since this browser has no way to unlock yet.
 */
export default function LinkPage() {
  const t = useTranslations('unlock.join');
  const { status, client, me } = useAppSession();
  const startedUnlocked = useRef<boolean | null>(null);
  if (startedUnlocked.current === null && status !== 'loading') {
    startedUnlocked.current = status === 'unlocked';
  }
  if (!client || !me || startedUnlocked.current === null) return null;
  return (
    <GateFrame end={<LanguageControl />}>
      {startedUnlocked.current ? (
        <>
          <p role="status">{t('alreadyUnlocked')}</p>
          <div>
            <Button variant="primary" size="lg" asChild>
              <Link href="/app">{t('done')}</Link>
            </Button>
          </div>
        </>
      ) : (
        <LinkFlow client={client} me={me} />
      )}
    </GateFrame>
  );
}
