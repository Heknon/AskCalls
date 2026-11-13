import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const alertVariants = cva(
  'flex gap-3 rounded-md px-4 py-3.5 text-sm leading-5 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      tone: {
        neutral: 'bg-muted text-foreground',
        info: 'bg-primary-subtle text-primary-subtle-foreground',
        warning: 'bg-warning-subtle text-warning-subtle-foreground',
        destructive: 'bg-destructive-subtle text-destructive-subtle-foreground',
        success: 'bg-success-subtle text-success-subtle-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Alert({
  className,
  tone,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" className={cn(alertVariants({ tone }), className)} {...props} />;
}
