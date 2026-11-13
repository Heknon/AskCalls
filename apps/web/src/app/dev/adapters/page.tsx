import { notFound } from 'next/navigation';
import { EMBEDDING_MODEL_URL_META } from '@/client/runtime-config';
import { getContainer } from '@/server/container';
import { embeddingModelUrl } from '@/server/http/csp';
import { Harness } from './harness';

/**
 * Development-only harness for the browser adapters, driven by
 * `scripts/test-browser-adapters.ts` (Playwright). Not available in production.
 */
export const dynamic = 'force-dynamic';

export default async function AdaptersDevPage() {
  const { config } = await getContainer();
  if (config.environment === 'production') notFound();
  const modelUrl = embeddingModelUrl(config.config);
  return (
    <>
      {modelUrl && <meta name={EMBEDDING_MODEL_URL_META} content={modelUrl} />}
      <Harness />
    </>
  );
}
