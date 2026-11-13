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
  /** The page names itself (the call view's contact): the title stays for screen readers only. */
  titleHidden?: boolean;
  /** The start of the desktop top bar: the call view's back link. */
  topStart?: ReactNode;
  /** A side panel at the end edge from 768 px, beside the content column (the call view). */
  aside?: ReactNode;
  /** `reading`: 720 px (transcript). `form`: 640 px (settings). Default: 1120 px. */
  width?: 'wide' | 'reading' | 'form';
  children?: ReactNode;
};

/** Settings sections sit beside their 208 px list on desktop, so the form column starts there. */
const WIDTH = {
  wide: 'max-w-280',
  reading: 'max-w-transcript',
  form: 'max-w-160 lg:mx-0',
} as const;

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
  titleHidden = false,
  topStart,
  aside,
  width = 'wide',
  children,
}: ScreenProps) {
  const t = useTranslations('shell.shortcuts.hints');
  const { mobileLock } = useShell();
  const [singleKey] = useSingleKeyShortcuts();
  const shownHints = hints && singleKey ? [...hints, { keys: ['?'], label: t('all') }] : undefined;
  const main = (
    <main id="main" className={`mx-auto w-full ${WIDTH[width]} px-4 py-4 md:px-6 md:py-6`}>
      <div className={titleHidden ? 'sr-only max-md:hidden' : 'max-md:hidden'}>
        <PageHeader title={title} description={description} actions={headerActions} />
      </div>
      {children}
    </main>
  );
  return (
    <>
      {actions || shownHints || topStart ? (
        <AppTopBar hints={shownHints} actions={actions} start={topStart} />
      ) : null}
      <MobileTopBar
        title={title}
        action={mobileAction}
        lock={mobileLock}
        linkAs={Link}
        {...(back && { back })}
      />
      {aside ? (
        <div className="flex flex-1">
          <div className="min-w-0 flex-1">{main}</div>
          {aside}
        </div>
      ) : (
        main
      )}
    </>
  );
}
