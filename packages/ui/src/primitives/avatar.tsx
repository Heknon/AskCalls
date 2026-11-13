'use client';

import { Avatar as AvatarPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Initials only: the app never loads remote images. */
export function Avatar({
  initials,
  className,
  ...props
}: ComponentProps<typeof AvatarPrimitive.Root> & { initials: string }) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary-subtle-foreground text-xs',
        className,
      )}
      {...props}
    >
      <AvatarPrimitive.Fallback>{initials}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
