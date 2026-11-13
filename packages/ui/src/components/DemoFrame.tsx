'use client';

import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../lib/use-media-query';
import { Button } from '../primitives/button';

export type DemoFrameProps = {
  /** The looping product recording, from the app's own origin. Absent: the poster alone. */
  src?: string;
  poster: string;
  /** What the recording shows, for screen readers. */
  description: string;
  labels: { play: string; pause: string };
};

/**
 * Frames the product recording with a pause control. Under reduced motion it shows the poster
 * and a play button instead of autoplaying.
 */
export function DemoFrame({ src, poster, description, labels }: DemoFrameProps) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (reduced) v.pause();
    else void v.play().catch(() => setPlaying(false));
  }, [reduced]);
  return (
    <figure
      data-component="DemoFrame"
      className="relative m-0 overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
    >
      <div
        aria-hidden
        className="flex items-center gap-2 border-border border-b bg-muted px-4 py-2.5"
      >
        <i className="size-2.5 rounded-full bg-input opacity-50" />
        <i className="size-2.5 rounded-full bg-input opacity-50" />
        <i className="size-2.5 rounded-full bg-input opacity-50" />
      </div>
      <video
        ref={video}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        aria-label={description}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="block aspect-video w-full bg-muted"
      />
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={playing ? labels.pause : labels.play}
        onClick={() => {
          const v = video.current;
          if (!v) return;
          if (v.paused) void v.play();
          else v.pause();
        }}
        className="absolute end-3 bottom-3"
      >
        {playing ? (
          <Pause className="size-4" aria-hidden />
        ) : (
          <Play className="size-4" aria-hidden />
        )}
      </Button>
    </figure>
  );
}
