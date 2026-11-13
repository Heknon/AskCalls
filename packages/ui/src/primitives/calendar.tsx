'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import { DayPicker } from 'react-day-picker';
import { cn } from '../lib/cn';
import { buttonVariants } from './button';

function Chevron({ orientation }: { orientation?: 'left' | 'right' | 'up' | 'down' }) {
  return orientation === 'left' ? (
    <ChevronLeft className="size-4" aria-hidden />
  ) : (
    <ChevronRight className="size-4" aria-hidden />
  );
}

export function Calendar({ className, classNames, ...props }: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays
      className={cn('p-1 text-sm', className)}
      classNames={{
        months: 'relative flex flex-col gap-4',
        month: 'flex flex-col gap-3',
        month_caption: 'flex h-8 items-center justify-center font-medium',
        nav: 'absolute inset-x-0 top-0 flex justify-between',
        button_previous: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' })),
        button_next: cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' })),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 font-normal text-muted-foreground text-xs',
        week: 'mt-1 flex w-full',
        day: 'relative size-9 p-0 text-center',
        day_button:
          'inline-flex size-9 cursor-pointer items-center justify-center rounded-md tabular hover:bg-accent',
        today: 'font-semibold text-primary',
        outside: 'text-subtle-foreground',
        disabled: 'opacity-50',
        selected:
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary-hover',
        range_middle:
          '[&>button]:rounded-none [&>button]:bg-primary-subtle [&>button]:text-primary-subtle-foreground',
        range_start: '[&>button]:rounded-e-none',
        range_end: '[&>button]:rounded-s-none',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{ Chevron }}
      {...props}
    />
  );
}
