import type { ElementType } from 'react';
import { cn } from '../lib/cn';
import { type AppRoute, appRouteIcons } from './AppSidebar';

type TabRoute = Exclude<AppRoute, 'admin'>;

export type MobileTabBarProps = {
  active: AppRoute;
  hrefs: Record<TabRoute, string>;
  /** Short labels, always visible: Calls, Upload, Tags, Contacts, Settings. */
  labels: Record<TabRoute, string> & { main: string };
  linkAs?: ElementType;
};

const tabs: TabRoute[] = ['calls', 'upload', 'tags', 'contacts', 'settings'];

/** Primary navigation on phones: five destinations, Calls at the start edge. */
export function MobileTabBar({ active, hrefs, labels, linkAs: Link = 'a' }: MobileTabBarProps) {
  return (
    <nav
      data-component="MobileTabBar"
      aria-label={labels.main}
      className="fixed inset-x-0 bottom-0 z-20 grid h-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] grid-cols-5 border-border border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map((t) => {
        const Icon = appRouteIcons[t];
        const current = t === active || (t === 'settings' && active === 'admin');
        return (
          <Link
            key={t}
            href={hrefs[t]}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'group/tab flex flex-col items-center justify-center gap-0.75 font-medium text-2xs text-muted-foreground no-underline',
              current && 'text-primary',
            )}
          >
            <span
              className={cn(
                'flex h-7 w-13 items-center justify-center rounded-full',
                current && 'bg-primary-subtle',
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            {labels[t]}
          </Link>
        );
      })}
    </nav>
  );
}
