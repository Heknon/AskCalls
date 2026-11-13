'use client';

import { FastForward, Pause, Play, Rewind } from 'lucide-react';
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
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

export type RecordingPlayerHandle = { seek: (seconds: number, play?: boolean) => void };

export type RecordingPlayerProps = {
  /** The decrypted recording as a Blob URL. Absent while it decrypts. */
  src?: string;
  durationSec: number;
  /** Seconds where search hits fall: ticks on the timeline. */
  hits?: number[];
  /** `decrypting`: the play button spins. `error`: "Couldn't decrypt the recording". */
  state?: 'decrypting' | 'ready' | 'error';
  /** Starting position (a deep link to a hit). */
  defaultTime?: number;
  onTimeUpdate?: (seconds: number) => void;
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
  ref?: Ref<RecordingPlayerHandle>;
};

/** Plays the decrypted recording. Media controls are never mirrored: the player is LTR. */
export function RecordingPlayer({
  src,
  durationSec,
  hits = [],
  state = 'ready',
  defaultTime = 0,
  onTimeUpdate,
  locale,
  labels,
  ref,
}: RecordingPlayerProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const [time, setTime] = useState(defaultTime);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const ready = state === 'ready';

  const seek = (seconds: number, play = false) => {
    const t = Math.min(durationSec, Math.max(0, seconds));
    setTime(t);
    if (audio.current) {
      audio.current.currentTime = t;
      if (play) void audio.current.play();
    }
  };
  useImperativeHandle(ref, () => ({ seek }));

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate]);

  const toggle = () => {
    const a = audio.current;
    if (!a || !ready) return;
    if (a.paused) void a.play();
    else a.pause();
  };

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
      {src ? (
        // biome-ignore lint/a11y/useMediaCaption: the transcript next to the player is the text
        <audio
          ref={audio}
          src={src}
          preload="metadata"
          onTimeUpdate={(e) => {
            setTime(e.currentTarget.currentTime);
            onTimeUpdate?.(e.currentTarget.currentTime);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      ) : null}
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
        onClick={toggle}
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
      <Select value={String(rate)} onValueChange={(v) => setRate(Number(v))} disabled={!ready}>
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
