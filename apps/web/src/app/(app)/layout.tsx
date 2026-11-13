import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { NoticesProvider } from '../../client/notices/notices';
import { EMBEDDING_MODEL_URL_META } from '../../client/runtime-config';
import { AppSessionProvider } from '../../client/session/session';
import { testEmbedderEnabled } from '../../server/auth/config';
import { getContainer } from '../../server/container';
import { embeddingModelUrl, localAgentLinkUrl } from '../../server/http/csp';
import { LocalAgentLink } from './_gate/local-agent-link';
import { SessionGate } from './_gate/session-gate';

/**
 * Every /app and /admin route: the client session (keys, browser adapters) and the unlock gate.
 * Reading the request headers renders per request, which lets Next.js put middleware's CSP
 * nonce on its bootstrap scripts. The embedding model host is instance config, so it reaches
 * the client in a meta tag (client/runtime-config.ts) rather than at build time.
 */
export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  await headers();
  const { config } = await getContainer();
  const modelUrl = embeddingModelUrl(config.config);
  const agentLinkUrl = localAgentLinkUrl(config.config);
  return (
    <NoticesProvider>
      {modelUrl ? <meta name={EMBEDDING_MODEL_URL_META} content={modelUrl} /> : null}
      <AppSessionProvider testEmbedder={testEmbedderEnabled(config)}>
        <SessionGate>{children}</SessionGate>
        {agentLinkUrl ? <LocalAgentLink url={agentLinkUrl} /> : null}
      </AppSessionProvider>
    </NoticesProvider>
  );
}
