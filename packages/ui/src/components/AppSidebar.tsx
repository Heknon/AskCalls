'use client';

import { BookUser, Keyboard, Phone, Server, Settings, Tags, Upload } from 'lucide-react';
import type { ElementType, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Avatar } from '../primitives/avatar';
import { Button } from '../primitives/button';
import { Tooltip } from '../primitives/tooltip';
import { Logo } from './Logo';

export type AppRoute = 'calls' | 'upload' | 'tags' | 'contacts' | 'settings' | 'admin';

export const appRouteIcons = {
  calls: Phone,
  upload: Upload,
  tags: Tags,
  contacts: BookUser,
  settings: Settings,
  admin: Server,
} satisfies Record<AppRoute, unknown>;

export type AppSidebarProps = {
  active: AppRoute;
  hrefs: Record<AppRoute, string>;
  /** Shows the Instance group with Admin. */
  isAdmin?: boolean;
  callCount?: number;
  labels: Record<AppRoute, string> & {
    main: string;
    instance: string;
    shortcuts: string;
    brand: string;
  };
  account: { name: string; initials: string; detail: string };
  /** The `LockStatus` for the footer. */
  lock: ReactNode;
  onShortcuts: () => void;
  linkAs?: ElementType;
  className?: string;
};

const primary: AppRoute[] = ['calls', 'upload', 'tags', 'contacts', 'settings'];

/**
 * Primary navigation and the lock control: a 240 px sidebar at the start edge from `lg`, a
 * 72 px icon rail at `md`, hidden on phones (MobileTabBar).
 */
export function AppSidebar({
  active,
  hrefs,
  isAdmin = false,
  callCount,
  labels,
  account,
  lock,
  onShortcuts,
  linkAs: Link = 'a',
  className,
}: AppSidebarProps) {
  const item = (route: AppRoute) => {
    const Icon = appRouteIcons[route];
    const current = route === active;
    return (
      <Tooltip key={route} content={labels[route]}>
        <Link
          href={hrefs[route]}
          aria-current={current ? 'page' : undefined}
          aria-label={labels[route]}
          className={cn(
            'flex h-9 items-center gap-2.5 rounded-md px-2.5 font-medium text-sidebar-foreground no-underline hover:bg-accent max-lg:w-11 max-lg:justify-center max-lg:px-0',
            current && 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent',
          )}
        >
          <Icon
            className={cn(
              'size-4.5 shrink-0',
              current ? 'text-sidebar-accent-foreground' : 'text-muted-foreground',
            )}
            aria-hidden
          />
          <span className="max-lg:hidden">{labels[route]}</span>
          {route === 'calls' && callCount !== undefined ? (
            <span className="tabular ms-auto text-muted-foreground text-xs max-lg:hidden">
              {callCount}
            </span>
          ) : null}
        </Link>
      </Tooltip>
    );
  };
  return (
    <aside
      data-component="AppSidebar"
      className={cn(
        'sticky top-0 hidden h-dvh w-(--rail-width) shrink-0 flex-col gap-1 border-sidebar-border border-e bg-sidebar px-2 py-3.5 max-lg:items-center md:flex lg:w-(--sidebar-width) lg:px-3',
        className,
      )}
    >
      <Link
        href={hrefs.calls}
        aria-label={labels.brand}
        className="px-2 pt-1 pb-3 no-underline max-lg:px-0"
      >
        <Logo name={labels.brand} className="[&>span]:max-lg:hidden" />
      </Link>
      <nav aria-label={labels.main} className="flex flex-col gap-0.5">
        {primary.map(item)}
        {isAdmin ? (
          <>
            <div className="px-2.5 pt-3.5 pb-1 font-medium text-muted-foreground text-xs max-lg:hidden">
              {labels.instance}
            </div>
            {item('admin')}
          </>
        ) : null}
      </nav>
      <div className="mt-auto flex w-full flex-col gap-3 max-lg:items-center">
        {lock}
        <div className="flex items-center gap-2 px-1 max-lg:hidden">
          <Avatar initials={account.initials} />
          <div className="min-w-0 flex-1 text-sm leading-4.5">
            <div dir="auto" className="truncate font-medium">
              {account.name}
            </div>
            <div className="truncate text-muted-foreground text-xs">{account.detail}</div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={labels.shortcuts}
            onClick={onShortcuts}
          >
            <Keyboard className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </aside>
  );
}
