import type { ReactNode } from 'react';
import { getContainer } from '../../../server/container';
import { AppShell } from './_shell/app-shell';

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const { config } = await getContainer();
  return <AppShell localServer={config.config.appMode === 'local'}>{children}</AppShell>;
}
