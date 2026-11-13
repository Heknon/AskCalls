import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { NoticesProvider } from '../../client/notices/notices';
import {
  CONNECT_SRC_META,
  connectSrcOf,
  EMBEDDING_MODEL_URL_META,
} from '../../client/runtime-config';
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
 * the client in a meta tag (client/runtime-config.ts) rather than at build time. So does this
 * document's `connect-src`, which tells the client whether new own-key origins need a reload.
 */
export default async function AppGroupLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  const { config } = await getContainer();
  const modelUrl = embeddingModelUrl(config.config);
  const agentLinkUrl = localAgentLinkUrl(config.config);
  const connectSrc = connectSrcOf(h.get('content-security-policy'));
  return (
    <NoticesProvider>
      {modelUrl ? <meta name={EMBEDDING_MODEL_URL_META} content={modelUrl} /> : null}
      {connectSrc ? <meta name={CONNECT_SRC_META} content={connectSrc.join(' ')} /> : null}
      <AppSessionProvider testEmbedder={testEmbedderEnabled(config)}>
        <SessionGate>{children}</SessionGate>
        {agentLinkUrl ? <LocalAgentLink url={agentLinkUrl} /> : null}
      </AppSessionProvider>
    </NoticesProvider>
  );
}
