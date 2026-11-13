'use client';

import { ContextMenu as ContextMenuPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';
import { menuContentClass, menuItemClass } from './dropdown-menu';

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

export function ContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content className={cn(menuContentClass, className)} {...props} />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  variant,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Item> & { variant?: 'destructive' }) {
  return (
    <ContextMenuPrimitive.Item
      data-variant={variant}
      className={cn(menuItemClass, className)}
      {...props}
    />
  );
}

export function ContextMenuSeparator(props: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return <ContextMenuPrimitive.Separator className="-mx-1 my-1 h-px bg-border" {...props} />;
}
