import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/** Developer tools. Never served in production builds. */
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return children;
}
