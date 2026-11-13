'use client';

import { CircleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { buttonVariants } from '../primitives/button';
import {
  Toast,
  ToastAction,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '../primitives/toast';

export type NoticeProps = {
  /** `event`: something happened. `undo`: a reversible action with Undo. `error`: it failed. */
  kind: 'event' | 'undo' | 'error';
  title: string;
  description?: string;
  /** The event's icon (inbox, lock, trash-2). Errors use circle-alert. */
  icon?: LucideIcon;
  /** Undo for `kind="undo"`, or one follow-up ("View"). `altText` says how to do it without the toast. */
  action?: { label: string; altText: string; onAction: () => void };
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Milliseconds; undo notices default to 5 s. */
  duration?: number;
};

/** The toast region; render once near the root. Toasts stack at the bottom end. */
export function NoticeRegion({
  children,
  label,
  className,
}: {
  children?: ReactNode;
  /** "Notifications". */
  label: string;
  className?: string;
}) {
  return (
    <ToastProvider label={label} swipeDirection="down">
      {children}
      <ToastViewport className={className} />
    </ToastProvider>
  );
}

/** A short confirmation or event that needs no decision. No colour for plain confirmations. */
export function Notice({
  kind,
  title,
  description,
  icon,
  action,
  open,
  onOpenChange,
  duration,
}: NoticeProps) {
  const Icon = kind === 'error' ? CircleAlert : icon;
  return (
    <Toast
      data-component="Notice"
      data-kind={kind}
      type={kind === 'error' ? 'foreground' : 'background'}
      open={open}
      onOpenChange={onOpenChange}
      duration={duration ?? (kind === 'undo' ? 5000 : undefined)}
    >
      {Icon ? (
        <Icon
          className={cn(
            'mt-0.5 size-4.5 shrink-0',
            kind === 'error' ? 'text-destructive' : 'text-foreground',
          )}
          aria-hidden
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <ToastTitle className="font-semibold text-base">{title}</ToastTitle>
        {description ? (
          <ToastDescription className="text-muted-foreground">{description}</ToastDescription>
        ) : null}
      </div>
      {action ? (
        <ToastAction
          altText={action.altText}
          onClick={action.onAction}
          className={buttonVariants({ variant: kind === 'undo' ? 'outline' : 'ghost', size: 'sm' })}
        >
          {action.label}
        </ToastAction>
      ) : null}
    </Toast>
  );
}
