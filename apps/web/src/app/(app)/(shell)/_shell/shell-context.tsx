'use client';

import { createContext, type ReactNode, useContext } from 'react';

export interface ShellApi {
  /** The `LockStatus variant="icon"` for `MobileTopBar`. */
  mobileLock: ReactNode;
  openShortcuts(): void;
}

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const s = useContext(ShellContext);
  if (!s) throw new Error('useShell is only available inside the app shell');
  return s;
}
