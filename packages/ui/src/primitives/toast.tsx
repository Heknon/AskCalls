'use client';

import { Toast as ToastPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const ToastProvider = ToastPrimitive.Provider;
export const ToastTitle = ToastPrimitive.Title;
export const ToastDescription = ToastPrimitive.Description;
export const ToastAction = ToastPrimitive.Action;
export const ToastClose = ToastPrimitive.Close;

export function ToastViewport({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        'fixed inset-x-4 bottom-[calc(var(--bottom-nav-height)+1rem)] z-50 flex flex-col gap-3 outline-none md:inset-x-auto md:end-5 md:bottom-5 md:w-96',
        className,
      )}
      {...props}
    />
  );
}

export function Toast({ className, ...props }: ComponentProps<typeof ToastPrimitive.Root>) {
  return (
    <ToastPrimitive.Root
      className={cn(
        'flex w-full animate-fade-in items-start gap-3 rounded-lg border border-border bg-popover px-4 py-3.5 text-popover-foreground text-sm shadow-lg',
        className,
      )}
      {...props}
    />
  );
}
