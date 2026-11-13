import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content min-h-16 w-full rounded-md border border-input bg-card px-3 py-2 text-md text-foreground placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-base',
        className,
      )}
      {...props}
    />
  );
}
