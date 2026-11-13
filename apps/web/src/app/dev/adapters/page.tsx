import { notFound } from 'next/navigation';
import { getContainer } from '@/server/container';
import { Harness } from './harness';

/**
 * Development-only harness for the browser adapters, driven by
 * `scripts/test-browser-adapters.ts` (Playwright). Not available in production.
 */
export const dynamic = 'force-dynamic';

export default async function AdaptersDevPage() {
  const { config } = await getContainer();
  if (config.environment === 'production') notFound();
  return <Harness />;
}
