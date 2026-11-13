import type { ReactNode } from 'react';

/** A word that matched the current search. Never for emphasis. */
export function HitMark({ children }: { children: ReactNode }) {
  return <mark data-component="HitMark">{children}</mark>;
}
