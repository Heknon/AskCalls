import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const inputClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 text-md text-foreground placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive read-only:bg-muted md:text-base';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" type={type} className={cn(inputClass, className)} {...props} />;
}
