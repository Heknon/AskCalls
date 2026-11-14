import { Pause, Play, X } from 'lucide-react';
import type { ElementType } from 'react';
import { formatClock } from '../lib/clock';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';

export type NowPlayingProps = {
  /** The call's contact name, number or "Call". */
  title: string;
  /** The call view of the recording that's playing. */
  href: string;
  time: number;
  durationSec: number;
  playing: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Phones: sit above the MobileTabBar. */
  aboveTabBar?: boolean;
  labels: { region: string; play: string; pause: string; close: string };
  linkAs?: ElementType;
  className?: string;
};

const R = 16;
const CIRCUMFERENCE = 2 * Math.PI * R;

/**
 * The recording that keeps playing after the user leaves its call: a floating pill at the
 * bottom end edge with play/pause (its ring is the progress), the call it belongs to and close.
 */
export function NowPlaying({
  title,
  href,
  time,
  durationSec,
  playing,
  onToggle,
  onClose,
  aboveTabBar = false,
  labels,
  linkAs: Link = 'a',
  className,
}: NowPlayingProps) {
  const progress = durationSec > 0 ? Math.min(1, time / durationSec) : 0;
  return (
    <section
      data-component="NowPlaying"
      data-state={playing ? 'playing' : 'paused'}
      aria-label={labels.region}
      className={cn(
        'fixed end-4 z-30 flex w-[min(20rem,calc(100vw-2rem))] items-center gap-2 rounded-full border border-border bg-card py-1.5 ps-1.5 pe-1 shadow-lg md:end-6 md:bottom-6',
        aboveTabBar
          ? 'bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+0.75rem)]'
          : 'bottom-[calc(env(safe-area-inset-bottom)+1rem)]',
        className,
      )}
    >
      <button
        type="button"
        aria-label={playing ? labels.pause : labels.play}
        onClick={onToggle}
        className="relative inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover"
      >
        <svg aria-hidden viewBox="0 0 40 40" className="absolute inset-0 size-10 -rotate-90">
          <circle
            cx="20"
            cy="20"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.3}
            strokeWidth={2.5}
          />
          <circle
            cx="20"
            cy="20"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          />
        </svg>
        {playing ? (
          <Pause className="size-3.5 fill-current" aria-hidden />
        ) : (
          <Play className="size-3.5 fill-current" aria-hidden />
        )}
      </button>
      <Link
        href={href}
        className="flex min-w-0 flex-1 flex-col rounded-sm text-foreground no-underline hover:underline"
      >
        <bdi dir="auto" className="truncate font-medium text-sm">
          {title}
        </bdi>
        <span dir="ltr" className="tabular self-start text-muted-foreground text-xs">
          {`${formatClock(time)} / ${formatClock(durationSec)}`}
        </span>
      </Link>
      <Button variant="ghost" size="icon-sm" aria-label={labels.close} onClick={onClose}>
        <X className="size-4" aria-hidden />
      </Button>
    </section>
  );
}
