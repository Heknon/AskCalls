'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Toggle as TogglePrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const toggleVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        ghost: 'rounded-sm text-subtle-foreground hover:bg-muted data-[state=on]:text-foreground',
        chip: 'h-9 rounded-full border border-border bg-muted px-3 text-foreground text-sm hover:bg-accent data-[state=on]:border-primary data-[state=on]:bg-primary-subtle data-[state=on]:text-primary-subtle-foreground',
      },
    },
    defaultVariants: { variant: 'ghost' },
  },
);

export function Toggle({
  className,
  variant,
  ...props
}: ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant }), className)}
      {...props}
    />
  );
}
