import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { EMBEDDING_MODEL_URL_META } from '@/client/runtime-config';
import { getContainer } from '@/server/container';
import { embeddingModelUrl } from '@/server/http/csp';

/**
 * Reading the request headers makes every /app page render per request, which is what lets
 * Next.js put middleware's CSP nonce on its bootstrap scripts. The embedding model host is
 * instance config, so it reaches the client here rather than at build time.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await headers();
  const modelUrl = embeddingModelUrl((await getContainer()).config.config);
  return (
    <>
      {modelUrl && <meta name={EMBEDDING_MODEL_URL_META} content={modelUrl} />}
      {children}
    </>
  );
}
