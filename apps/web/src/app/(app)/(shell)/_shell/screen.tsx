'use client';

import { AppTopBar } from '@askcalls/ui/components/AppTopBar';
import { MobileTopBar } from '@askcalls/ui/components/MobileTopBar';
import { PageHeader } from '@askcalls/ui/components/PageHeader';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useSingleKeyShortcuts } from '../../../../client/shortcuts/shortcuts';
import { useShell } from './shell-context';

export type ScreenProps = {
  /** The page title: the `h1` (PageHeader on wide screens, MobileTopBar on phones). */
  title: string;
  /** Only when it carries information the user acts on. */
  description?: string;
  /** Page actions in the top bar from 768 px (Upload on Calls). */
  actions?: ReactNode;
  /** The one icon button in the phone top bar. */
  mobileAction?: ReactNode;
  /** Phones show a back arrow instead of the logo (call view, settings sections). */
  back?: { href: string; label: string };
  /** Shortcut hints in the top bar on wide screens; "? All shortcuts" is added. */
  hints?: { keys: string[]; label: string }[];
  /** Actions next to the title (Settings → Security: none; Tags: New tag). */
  headerActions?: ReactNode;
  /** `reading`: 720 px (transcript). `form`: 640 px (settings). Default: 1120 px. */
  width?: 'wide' | 'reading' | 'form';
  children?: ReactNode;
};

const WIDTH = { wide: 'max-w-280', reading: 'max-w-transcript', form: 'max-w-160' } as const;

/**
 * One app page inside the shell: top bars for every breakpoint, the page title, and the content
 * column. Every screen under (shell) renders exactly one.
 */
export function Screen({
  title,
  description,
  actions,
  mobileAction,
  back,
  hints,
  headerActions,
  width = 'wide',
  children,
}: ScreenProps) {
  const t = useTranslations('shell.shortcuts.hints');
  const { mobileLock } = useShell();
  const [singleKey] = useSingleKeyShortcuts();
  const shownHints = hints && singleKey ? [...hints, { keys: ['?'], label: t('all') }] : undefined;
  return (
    <>
      {actions || shownHints ? <AppTopBar hints={shownHints} actions={actions} /> : null}
      <MobileTopBar
        title={title}
        action={mobileAction}
        lock={mobileLock}
        linkAs={Link}
        {...(back && { back })}
      />
      <main id="main" className={`mx-auto w-full ${WIDTH[width]} px-4 py-4 md:px-6 md:py-6`}>
        <div className="max-md:hidden">
          <PageHeader title={title} description={description} actions={headerActions} />
        </div>
        {children}
      </main>
    </>
  );
}
