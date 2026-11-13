'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export function Switch({
  className,
  size = 'default',
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root> & { size?: 'default' | 'sm' }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'group/switch inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-input p-0.5 transition-colors duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-50 data-[size=sm]:h-4 data-[size=sm]:w-7 data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4 rounded-full bg-card shadow-sm transition-transform duration-(--duration-fast) group-data-[size=sm]/switch:size-3 data-[state=checked]:translate-x-4 group-data-[size=sm]/switch:data-[state=checked]:translate-x-3 rtl:data-[state=checked]:-translate-x-4 rtl:group-data-[size=sm]/switch:data-[state=checked]:-translate-x-3" />
    </SwitchPrimitive.Root>
  );
}
