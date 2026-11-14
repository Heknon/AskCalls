'use client';

import { FastForward, Pause, Play, Rewind } from 'lucide-react';
import { cn } from '../lib/cn';
import { formatClock, formatSpokenClock } from '../lib/format';
import { Button } from '../primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../primitives/select';
import { Slider } from '../primitives/slider';
import { Spinner } from '../primitives/spinner';

const RATES = [0.75, 1, 1.25, 1.5, 2];
const STEP = 5;

export type RecordingPlayerProps = {
  durationSec: number;
  /** Current position in seconds. */
  time: number;
  playing: boolean;
  rate: number;
  /** Seconds where search hits fall: ticks on the timeline. */
  hits?: number[];
  /** `decrypting`: the play button spins. `error`: "Couldn't decrypt the recording". */
  state?: 'decrypting' | 'ready' | 'error';
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onRateChange: (rate: number) => void;
  locale: string;
  labels: {
    play: string;
    pause: string;
    back: string;
    forward: string;
    position: string;
    speed: string;
    of: (current: string, total: string) => string;
    error: string;
  };
};

/**
 * Controls for the decrypted recording; the audio element belongs to the app shell, so playback
 * survives navigation. Media controls are never mirrored: the player is LTR.
 */
export function RecordingPlayer({
  durationSec,
  time,
  playing,
  rate,
  hits = [],
  state = 'ready',
  onToggle,
  onSeek,
  onRateChange,
  locale,
  labels,
}: RecordingPlayerProps) {
  const ready = state === 'ready';
  const seek = (seconds: number) => onSeek(Math.min(durationSec, Math.max(0, seconds)));

  if (state === 'error') {
    return (
      <div
        data-component="RecordingPlayer"
        data-state="error"
        role="alert"
        className="px-4 py-3 text-destructive text-sm"
      >
        {labels.error}
      </div>
    );
  }

  return (
    <div
      data-component="RecordingPlayer"
      data-state={state}
      dir="ltr"
      className="flex items-center gap-2 md:gap-3"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={labels.back}
        disabled={!ready}
        onClick={() => seek(time - STEP)}
      >
        <Rewind className="size-4" aria-hidden />
      </Button>
      <button
        type="button"
        aria-label={playing ? labels.pause : labels.play}
        aria-keyshortcuts="Space"
        disabled={!ready}
        onClick={onToggle}
        className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover disabled:cursor-wait"
      >
        {state === 'decrypting' ? (
          <Spinner className="size-4" />
        ) : playing ? (
          <Pause className="size-4 fill-current" aria-hidden />
        ) : (
          <Play className="size-4 fill-current" aria-hidden />
        )}
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={labels.forward}
        disabled={!ready}
        onClick={() => seek(time + STEP)}
      >
        <FastForward className="size-4" aria-hidden />
      </Button>
      <span className="tabular text-muted-foreground text-xs">{formatClock(time)}</span>
      <Slider
        dir="ltr"
        min={0}
        max={durationSec}
        step={1}
        value={[time]}
        disabled={!ready}
        onValueChange={([v]) => seek(v ?? 0)}
        thumbLabel={labels.position}
        valueText={labels.of(
          formatSpokenClock(time, locale),
          formatSpokenClock(durationSec, locale),
        )}
        className="flex-1"
      >
        {hits.map((h) => (
          <span
            key={h}
            aria-hidden
            className="absolute -top-1.25 h-4 w-0.5 rounded-full bg-hit-tick"
            style={{ left: `${(h / durationSec) * 100}%` }}
          />
        ))}
      </Slider>
      <span className="tabular text-muted-foreground text-xs">{formatClock(durationSec)}</span>
      <Select value={String(rate)} onValueChange={(v) => onRateChange(Number(v))} disabled={!ready}>
        <SelectTrigger
          aria-label={labels.speed}
          className={cn(
            'h-8 w-auto gap-1 border-transparent bg-transparent px-2 font-medium tabular hover:bg-accent [&>svg]:hidden',
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {RATES.map((r) => (
            <SelectItem key={r} value={String(r)}>
              {`${r}×`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
