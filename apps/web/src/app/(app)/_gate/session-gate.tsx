'use client';

import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect } from 'react';
import { useAppSession } from '../../../client/session/session';
import { GateFrame } from '../../_gate/gate-frame';
import { UnlockGate } from './unlock-gate';

export const WELCOME_PATH = '/app/welcome';
/** Joining with a link code: signed in, but this browser can't unlock yet. */
export const LINK_PATH = '/app/link';

/**
 * Decides what an app route shows: nothing while the account and client load, onboarding for an
 * account without unlock methods, the unlock gate while locked (except on the link page), the
 * route once unlocked. The
 * gate replaces content instantly (no animation), and the URL stays, so a deep link opens after
 * unlock.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const { status, error, retry } = useAppSession();
  const pathname = usePathname();
  const router = useRouter();
  const onWelcome = pathname === WELCOME_PATH;

  useEffect(() => {
    if (status === 'onboarding' && !onWelcome) router.replace(WELCOME_PATH);
  }, [status, onWelcome, router]);

  if (status === 'loading' || (status === 'onboarding' && !onWelcome)) {
    return <div aria-busy="true" className="min-h-dvh" />;
  }
  if (status === 'error') {
    return (
      <GateFrame>
        <ErrorState
          scope="page"
          title={t('error.title')}
          description={error === 'offline' ? t('error.offline') : t('error.body')}
          retry={{ label: t('retry'), onRetry: retry }}
        />
      </GateFrame>
    );
  }
  if (onWelcome || pathname === LINK_PATH) return children;
  if (status === 'locked') return <UnlockGate />;
  return children;
}
