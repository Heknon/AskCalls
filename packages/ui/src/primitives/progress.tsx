'use client';

import { Progress as ProgressPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export function Progress({
  className,
  value,
  max = 100,
  tone = 'primary',
  ...props
}: ComponentProps<typeof ProgressPrimitive.Root> & {
  tone?: 'primary' | 'warning' | 'destructive' | 'success';
}) {
  const pct = value == null ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-tone={tone}
        className="h-full rounded-full bg-primary transition-[width] duration-(--duration-base) data-[tone=destructive]:bg-destructive data-[tone=success]:bg-success data-[tone=warning]:bg-warning"
        style={{ width: `${pct}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
