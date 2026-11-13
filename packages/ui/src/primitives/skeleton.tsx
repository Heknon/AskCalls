import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export function Skeleton({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="skeleton"
      aria-hidden
      className={cn('skeleton block h-3', className)}
      {...props}
    />
  );
}
