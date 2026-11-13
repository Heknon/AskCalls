import type { ReactNode } from 'react';
import { SettingsMenu } from './_settings/settings-nav';

/**
 * Desktop: the 208 px section list beside the section. Tablet and phone: the list is the
 * Settings index page and each section opens on its own.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1">
      <aside className="hidden w-52 shrink-0 ps-6 pt-6 lg:block">
        <SettingsMenu variant="list" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
