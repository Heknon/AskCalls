'use client';

import { NowPlaying } from '@askcalls/ui/components/NowPlaying';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePlayback } from '../../../../client/playback/use-playback';

export default function NowPlayingBar({ aboveTabBar }: { aboveTabBar: boolean }) {
  const t = useTranslations('shell.nowPlaying');
  const playback = usePlayback();
  const track = playback.track;
  if (!track) return null;
  return (
    <NowPlaying
      title={track.title}
      href={`/app/calls/${track.callId}`}
      time={playback.time}
      durationSec={track.durationSec}
      playing={playback.playing}
      onToggle={playback.toggle}
      onClose={playback.stop}
      aboveTabBar={aboveTabBar}
      labels={{ region: t('region'), play: t('play'), pause: t('pause'), close: t('close') }}
      linkAs={Link}
    />
  );
}
