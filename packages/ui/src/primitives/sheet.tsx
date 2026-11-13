'use client';

import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

const sides = {
  end: 'inset-y-0 end-0 h-full w-full max-w-(--panel-width) border-s animate-panel-in-end',
  bottom:
    'inset-x-0 bottom-0 max-h-4/5 rounded-t-xl border-t pb-[env(safe-area-inset-bottom)] animate-panel-in-bottom',
};

export function SheetContent({
  className,
  side = 'end',
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { side?: keyof typeof sides }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 animate-fade-in bg-overlay" />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          'fixed z-50 flex flex-col overflow-auto border-border bg-popover text-popover-foreground shadow-lg',
          sides[side],
          className,
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}
