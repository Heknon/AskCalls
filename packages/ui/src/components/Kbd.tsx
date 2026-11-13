import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** A keyboard key in hints and the shortcuts dialog. Key glyphs never mirror. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      data-component="Kbd"
      dir="ltr"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-border border-b-2 bg-card px-1.25 font-mono text-2xs text-muted-foreground leading-none',
        className,
      )}
      {...props}
    />
  );
}
