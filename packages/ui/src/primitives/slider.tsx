'use client';

import { Slider as SliderPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export function Slider({
  className,
  thumbLabel,
  valueText,
  children,
  ...props
}: ComponentProps<typeof SliderPrimitive.Root> & { thumbLabel?: string; valueText?: string }) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        'relative flex w-full cursor-pointer touch-none select-none items-center py-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-visible rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
        {children}
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={thumbLabel}
        aria-valuetext={valueText}
        className="block size-3.5 rounded-full border-2 border-primary bg-card shadow-sm"
      />
    </SliderPrimitive.Root>
  );
}
