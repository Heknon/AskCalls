import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/**
 * A platform `<select>` that looks like `SelectTrigger`: for lists of hundreds of options, where
 * the platform picker scrolls and finds by typing better than a menu.
 */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          'h-9 w-full min-w-0 cursor-pointer appearance-none truncate rounded-md border border-input bg-card ps-3 pe-9 text-base text-foreground focus-visible:border-ring focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
      <ChevronDown
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}
