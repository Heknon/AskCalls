'use client';

import { HoverCard as HoverCardPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const HoverCard = HoverCardPrimitive.Root;
export const HoverCardTrigger = HoverCardPrimitive.Trigger;

export function HoverCardContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 animate-fade-in rounded-lg border border-border bg-popover p-4 text-popover-foreground text-sm shadow-md',
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}
