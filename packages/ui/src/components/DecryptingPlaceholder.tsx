import { Lock } from 'lucide-react';
import type { CSSProperties } from 'react';
import { cn } from '../lib/cn';
import { Skeleton } from '../primitives/skeleton';

export type DecryptingPlaceholderProps = {
  shape?: 'line' | 'row' | 'paragraph';
  /**
   * The lock icon's accessible name ("Decrypting"). Pass it once per list, on the first
   * placeholder; the rest stay silent.
   */
  label?: string;
  /** Width of a `line`, as a fraction of the container (0 to 1). */
  width?: number;
  className?: string;
};

const widths = [0.96, 0.88, 0.7];

/**
 * Content that is here but not yet decrypted on this device: a skeleton plus the lock icon,
 * no caption. For a network wait use the bare `Skeleton` primitive instead.
 */
export function DecryptingPlaceholder({
  shape = 'line',
  label,
  width,
  className,
}: DecryptingPlaceholderProps) {
  const lock = (
    <Lock
      className="size-3.5 shrink-0 text-subtle-foreground"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
  if (shape === 'line') {
    const style: CSSProperties | undefined = width ? { width: `${width * 100}%` } : undefined;
    return (
      <span
        data-component="DecryptingPlaceholder"
        aria-busy="true"
        className={cn('inline-flex min-w-16 items-center gap-1.5 align-middle', className)}
        style={style}
      >
        <Skeleton className="flex-1" />
        {label ? lock : null}
      </span>
    );
  }
  if (shape === 'paragraph') {
    return (
      <div
        data-component="DecryptingPlaceholder"
        aria-busy="true"
        className={cn('flex flex-col gap-2', className)}
      >
        {widths.map((w) => (
          <Skeleton key={w} style={{ width: `${w * 100}%` }} />
        ))}
        {lock}
      </div>
    );
  }
  return (
    <div
      data-component="DecryptingPlaceholder"
      aria-busy="true"
      className={cn('grid grid-cols-[2rem_1fr_auto] gap-x-3 gap-y-2 py-3.5 ps-2.5 pe-4', className)}
    >
      <span />
      <span className="flex gap-2.5">
        <Skeleton className="w-30" />
        <Skeleton className="w-28" />
      </span>
      <Skeleton className="w-16" />
      <span />
      <span className="col-span-2 flex flex-col gap-2 pt-1.5">
        {widths.map((w) => (
          <Skeleton key={w} style={{ width: `${w * 100}%` }} />
        ))}
        {lock}
      </span>
    </div>
  );
}
