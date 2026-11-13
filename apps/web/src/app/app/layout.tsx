import { headers } from 'next/headers';
import type { ReactNode } from 'react';

/**
 * Reading the request headers makes every /app page render per request, which is what lets
 * Next.js put middleware's CSP nonce on its bootstrap scripts.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await headers();
  return children;
}
