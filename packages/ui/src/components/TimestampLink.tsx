'use client';

import { cn } from '../lib/cn';
import { formatClock } from '../lib/format';
import { Tooltip } from '../primitives/tooltip';

export type TimestampLinkProps = {
  seconds: number;
  /** Visible text when not the clock ("0:48"). */
  label?: string;
  onSeek: (seconds: number) => void;
  /** `segment`: beside a speaker name. `citation`: inside an ask answer. */
  context?: 'segment' | 'citation';
  /** "Play from 0:48". */
  a11yLabel: string;
  /**
   * No recording: the link still scrolls the transcript (onSeek runs) but explains in a tooltip
   * that nothing plays ("No recording saved for this call").
   */
  noRecordingHint?: string;
  className?: string;
};

/** Jump to a moment in the call. Mono digits, an LTR island in every locale. */
export function TimestampLink({
  seconds,
  label,
  onSeek,
  context = 'segment',
  a11yLabel,
  noRecordingHint,
  className,
}: TimestampLinkProps) {
  const button = (
    <button
      type="button"
      data-component="TimestampLink"
      dir="ltr"
      aria-label={a11yLabel}
      onClick={() => onSeek(seconds)}
      className={cn(
        'ltr-island cursor-pointer rounded-xs font-mono tabular',
        context === 'segment'
          ? 'px-1 text-muted-foreground text-xs hover:text-primary hover:underline'
          : 'inline-flex h-5 items-center bg-primary-subtle px-1.5 text-2xs text-primary-subtle-foreground hover:bg-primary hover:text-primary-foreground',
        className,
      )}
    >
      {label ?? formatClock(seconds)}
    </button>
  );
  return noRecordingHint ? <Tooltip content={noRecordingHint}>{button}</Tooltip> : button;
}
