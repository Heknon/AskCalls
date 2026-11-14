'use client';

import { lazy, Suspense } from 'react';
import { usePlaybackSlot } from '../../../../client/playback/playback';

const NowPlayingBar = lazy(() => import('./now-playing-bar'));

/** The playing recording, on every page but its own call view. */
export function ShellNowPlaying({
  pathname,
  aboveTabBar,
}: {
  pathname: string;
  aboveTabBar: boolean;
}) {
  const { track } = usePlaybackSlot();
  if (!track || pathname === `/app/calls/${track.callId}`) return null;
  return (
    <Suspense>
      <NowPlayingBar aboveTabBar={aboveTabBar} />
    </Suspense>
  );
}
