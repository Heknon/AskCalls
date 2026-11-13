'use client';

import { Pause, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../primitives/button';
import { Progress } from '../primitives/progress';

export type JobProgressProps = {
  done: number;
  total: number;
  /** "38 of 138 files done. 6 in progress, 2 failed." */
  label: ReactNode;
  paused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  /** Jobs that stop rather than pause (applying rules to existing calls). */
  onStop?: () => void;
  labels: { pause: string; resume: string; stop: string; progress: string };
};

/** Progress of a long job running on this device. The bar fills from the start edge. */
export function JobProgress({
  done,
  total,
  label,
  paused = false,
  onPause,
  onResume,
  onStop,
  labels,
}: JobProgressProps) {
  return (
    <div
      data-component="JobProgress"
      data-paused={paused || undefined}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <span aria-live="polite">{label}</span>
        {onStop ? (
          <Button variant="ghost" size="sm" onClick={onStop}>
            {labels.stop}
          </Button>
        ) : paused && onResume ? (
          <Button variant="outline" size="sm" onClick={onResume}>
            <Play className="size-3.5" aria-hidden />
            {labels.resume}
          </Button>
        ) : onPause ? (
          <Button variant="outline" size="sm" onClick={onPause}>
            <Pause className="size-3.5" aria-hidden />
            {labels.pause}
          </Button>
        ) : null}
      </div>
      <Progress value={done} max={total} aria-label={labels.progress} className="h-2" />
    </div>
  );
}
