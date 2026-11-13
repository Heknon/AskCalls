'use client';

import { Lock } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';
import { Tooltip } from '../primitives/tooltip';
import { Kbd } from './Kbd';

export type LockStatusProps = {
  /** `sidebar`: icon, "Lock" and ⇧L (icon only in the rail). `icon`: the mobile top bar. */
  variant?: 'sidebar' | 'icon';
  onLock: () => void;
  labels: {
    /** "Lock". */
    lock: string;
    /** Accessible name: "Lock now". */
    lockNow: string;
    /** Tooltip: "Locks after 15 min idle". */
    autoLock: string;
  };
  /** Registers Shift+L. Turn off where another LockStatus on the page already does. */
  shortcut?: boolean;
  className?: string;
};

function inTextField() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/** Locks AskCalls now. Its presence means keys are unlocked in this tab. A control, not a status line. */
export function LockStatus({
  variant = 'sidebar',
  onLock,
  labels,
  shortcut = true,
  className,
}: LockStatusProps) {
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.shiftKey &&
        (e.key === 'L' || e.key === 'l') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !inTextField()
      ) {
        e.preventDefault();
        onLock();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut, onLock]);

  if (variant === 'icon') {
    return (
      <Tooltip content={labels.autoLock}>
        <Button
          data-component="LockStatus"
          variant="ghost"
          size="icon"
          aria-label={labels.lockNow}
          aria-keyshortcuts="Shift+L"
          onClick={onLock}
          className={className}
        >
          <Lock className="size-4.5" aria-hidden />
        </Button>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={labels.autoLock}>
      <Button
        data-component="LockStatus"
        variant="ghost"
        aria-label={labels.lockNow}
        aria-keyshortcuts="Shift+L"
        onClick={onLock}
        className={cn(
          'w-full justify-start px-2.5 text-sidebar-foreground max-lg:w-11 max-lg:justify-center max-lg:px-0',
          className,
        )}
      >
        <Lock className="size-4 text-muted-foreground" aria-hidden />
        <span className="max-lg:hidden">{labels.lock}</span>
        <Kbd className="ms-auto max-lg:hidden">⇧L</Kbd>
      </Button>
    </Tooltip>
  );
}
