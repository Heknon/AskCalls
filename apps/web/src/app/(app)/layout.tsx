import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { NoticesProvider } from '../../client/notices/notices';
import { AppSessionProvider } from '../../client/session/session';
import { testEmbedderEnabled } from '../../server/auth/config';
import { getContainer } from '../../server/container';
import { SessionGate } from './_gate/session-gate';

/**
 * Every /app and /admin route: the client session (keys, browser adapters) and the unlock gate.
 * Reading the request headers renders per request, which lets Next.js put middleware's CSP
 * nonce on its bootstrap scripts.
 */
export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  await headers();
  const { config } = await getContainer();
  return (
    <NoticesProvider>
      <AppSessionProvider testEmbedder={testEmbedderEnabled(config)}>
        <SessionGate>{children}</SessionGate>
      </AppSessionProvider>
    </NoticesProvider>
  );
}
