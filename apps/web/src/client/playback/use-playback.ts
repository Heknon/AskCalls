'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useAppSession } from '../session/session';
import { type Track, usePlaybackSlot } from './playback';

const EVENTS = ['timeupdate', 'play', 'pause', 'ended', 'ratechange', 'seeked', 'emptied'];

export interface Playback {
  track: Track | null;
  time: number;
  playing: boolean;
  rate: number;
  /** Replaces the current track (revoking its URL) and starts at `at`. */
  load(track: Track, at?: number): void;
  toggle(): void;
  seek(seconds: number, play?: boolean): void;
  setRate(rate: number): void;
  /** Stops and drops the track. */
  stop(): void;
}

/** Reads and drives the app shell's audio element. */
export function usePlayback(): Playback {
  const { audio, track, setTrack } = usePlaybackSlot();
  const { client } = useAppSession();
  const drop = (next: Track | null) => {
    if (track && track.src !== next?.src) client?.blobUrls.revoke(track.src);
    setTrack(next);
  };
  const subscribe = useCallback(
    (cb: () => void) => {
      const a = audio.current;
      for (const e of EVENTS) a?.addEventListener(e, cb);
      return () => {
        for (const e of EVENTS) a?.removeEventListener(e, cb);
      };
    },
    [audio],
  );
  const time = useSyncExternalStore(
    subscribe,
    () => audio.current?.currentTime ?? 0,
    () => 0,
  );
  const playing = useSyncExternalStore(
    subscribe,
    () => !!audio.current && !audio.current.paused,
    () => false,
  );
  const rate = useSyncExternalStore(
    subscribe,
    () => audio.current?.playbackRate ?? 1,
    () => 1,
  );

  const a = audio.current;
  return {
    track: track && a ? track : null,
    time: track ? time : 0,
    playing: !!track && playing,
    rate,
    load(next, at = 0) {
      if (!a) return;
      drop(next);
      a.src = next.src;
      a.playbackRate = a.defaultPlaybackRate = rate;
      a.currentTime = at;
    },
    toggle() {
      if (!a?.src) return;
      if (a.paused) void a.play();
      else a.pause();
    },
    seek(seconds, play = false) {
      if (!a?.src) return;
      a.currentTime = Math.max(0, Math.min(seconds, a.duration || seconds));
      if (play) void a.play();
    },
    setRate(r) {
      if (a) a.playbackRate = a.defaultPlaybackRate = r;
    },
    stop() {
      if (a) {
        a.pause();
        a.removeAttribute('src');
        a.load();
      }
      drop(null);
    },
  };
}
