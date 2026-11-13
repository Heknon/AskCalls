'use client';

import { AppSidebar } from '@askcalls/ui/components/AppSidebar';
import { LockStatus } from '@askcalls/ui/components/LockStatus';
import { MobileTabBar } from '@askcalls/ui/components/MobileTabBar';
import { type ShortcutGroup, ShortcutsDialog } from '@askcalls/ui/components/ShortcutsDialog';
import { StatusBanner } from '@askcalls/ui/components/StatusBanner';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState, useSyncExternalStore } from 'react';
import { useAppSession } from '../../../../client/session/session';
import type { ShortcutGroup as Group } from '../../../../client/shortcuts/registry';
import {
  ShortcutsProvider,
  useRegisteredShortcuts,
  useShortcut,
  useSingleKeyShortcuts,
} from '../../../../client/shortcuts/shortcuts';
import { initials } from '../../_gate/unlock-gate';
import { keyCaps } from './keys';
import { APP_HREFS, routeOf } from './routes';
import { ShellContext } from './shell-context';

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** The shortcuts every app page has: ?, Shift+L, g then c / u / t / s. */
function GlobalShortcuts({ onDialog, onLock }: { onDialog: () => void; onLock: () => void }) {
  const t = useTranslations('shell.shortcuts.keys');
  const router = useRouter();
  const go = (href: string) => () => router.push(href);
  useShortcut({ keys: ['?'], run: onDialog, group: 'everywhere', label: t('list') });
  useShortcut({ keys: ['L'], run: onLock, group: 'everywhere', label: t('lock') });
  useShortcut({
    keys: ['g', 'c'],
    run: go(APP_HREFS.calls),
    group: 'everywhere',
    label: t('goCalls'),
  });
  useShortcut({
    keys: ['g', 'u'],
    run: go(APP_HREFS.upload),
    group: 'everywhere',
    label: t('goUpload'),
  });
  useShortcut({
    keys: ['g', 't'],
    run: go(APP_HREFS.tags),
    group: 'everywhere',
    label: t('goTags'),
  });
  useShortcut({
    keys: ['g', 's'],
    run: go(APP_HREFS.settings),
    group: 'everywhere',
    label: t('goSettings'),
  });
  return null;
}

const COLUMNS: Group[][] = [['calls', 'everywhere'], ['callView']];

function Shortcuts({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('shell.shortcuts');
  const tc = useTranslations('common');
  const tk = useTranslations('shell.shortcuts.keys');
  const [singleKey] = useSingleKeyShortcuts();
  const registered = useRegisteredShortcuts();
  const columns = useMemo(() => {
    const groups = (g: Group): ShortcutGroup | null => {
      const items = registered
        .filter((s) => s.group === g)
        .map((s) => ({ label: s.label!, keys: keyCaps(s) }));
      if (g === 'everywhere') items.splice(0, 0, { label: tk('close'), keys: ['Esc'] });
      return items.length ? { title: t(`groups.${g}`), items } : null;
    };
    return COLUMNS.map((col) => col.map(groups).filter((g): g is ShortcutGroup => !!g)).filter(
      (col) => col.length > 0,
    );
  }, [registered, t, tk]);
  return (
    <ShortcutsDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      columns={columns}
      note={singleKey ? t('off') : t('offNow')}
      closeLabel={tc('close')}
    />
  );
}

/**
 * The frame of every /app and /admin page: AppSidebar from 768 px (a rail below 1024 px),
 * MobileTabBar below 768 px, the shortcuts dialog and global shortcuts, and the offline
 * banner. Pages render a `Screen` for their title, top bars and content.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('shell');
  const tc = useTranslations('common');
  const { me, lock, autoLockMinutes } = useAppSession();
  const pathname = usePathname();
  const active = routeOf(pathname);
  const [dialog, setDialog] = useState(false);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  const autoLock =
    autoLockMinutes > 0 ? t('lock.tooltip', { n: autoLockMinutes }) : t('lock.tooltipOff');
  const lockLabels = useMemo(
    () => ({ lock: t('lock.button'), lockNow: t('lock.now'), autoLock }),
    [t, autoLock],
  );
  const shell = useMemo(
    () => ({
      mobileLock: <LockStatus variant="icon" onLock={lock} labels={lockLabels} shortcut={false} />,
      openShortcuts: () => setDialog(true),
    }),
    [lock, lockLabels],
  );
  if (!me) return null;

  const nav = {
    calls: t('nav.calls'),
    upload: t('nav.upload'),
    tags: t('nav.tags'),
    contacts: t('nav.contacts'),
    settings: t('nav.settings'),
    admin: t('nav.admin'),
  };
  const detail = t(me.user.plan === 'pro' ? 'account.pro' : 'account.free', {
    calls: me.usage.calls,
    max: me.limits.maxCalls,
  });

  return (
    <ShortcutsProvider>
      <ShellContext.Provider value={shell}>
        <GlobalShortcuts onDialog={() => setDialog(true)} onLock={lock} />
        <div className="flex min-h-dvh">
          <AppSidebar
            active={active}
            hrefs={APP_HREFS}
            isAdmin={me.user.role === 'admin'}
            callCount={me.usage.calls}
            labels={{
              ...nav,
              main: t('nav.main'),
              instance: t('nav.instance'),
              shortcuts: t('shortcuts.open'),
              brand: tc('brand'),
            }}
            account={{
              name: me.user.name ?? me.user.email ?? '',
              initials: initials(me),
              detail,
            }}
            lock={
              <LockStatus variant="sidebar" onLock={lock} labels={lockLabels} shortcut={false} />
            }
            onShortcuts={() => setDialog(true)}
            linkAs={Link}
          />
          <div className="flex min-w-0 flex-1 flex-col pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0">
            {online ? null : <StatusBanner condition="offline">{t('banner.offline')}</StatusBanner>}
            {children}
          </div>
        </div>
        <MobileTabBar
          active={active}
          hrefs={APP_HREFS}
          labels={{ ...nav, tags: t('nav.tagsShort'), main: t('nav.main') }}
          linkAs={Link}
        />
        <Shortcuts open={dialog} onOpenChange={setDialog} />
      </ShellContext.Provider>
    </ShortcutsProvider>
  );
}
