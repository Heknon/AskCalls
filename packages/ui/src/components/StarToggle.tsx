'use client';

import { Star } from 'lucide-react';
import { cn } from '../lib/cn';
import { Toggle } from '../primitives/toggle';

export type StarToggleProps = {
  starred: boolean;
  onStarredChange: (starred: boolean) => void;
  /** Accessible names: "Star" and "Unstar". */
  labels: { star: string; unstar: string };
  size?: 'row' | 'header';
  className?: string;
};

/** Star or unstar a call. A separate concept from tags in the UI, with shortcut `s`. */
export function StarToggle({
  starred,
  onStarredChange,
  labels,
  size = 'row',
  className,
}: StarToggleProps) {
  return (
    <Toggle
      data-component="StarToggle"
      pressed={starred}
      onPressedChange={onStarredChange}
      aria-label={starred ? labels.unstar : labels.star}
      className={cn('size-8 data-[state=on]:text-star', size === 'header' && 'size-9', className)}
    >
      <Star
        className={cn(size === 'header' ? 'size-5' : 'size-4.5', starred && 'fill-current')}
        aria-hidden
      />
    </Toggle>
  );
}
