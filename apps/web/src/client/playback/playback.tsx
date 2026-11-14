'use client';

import { createContext, type ReactNode, type RefObject, useContext, useRef, useState } from 'react';

/** A decrypted recording handed to the shell's player. Its Blob URL is the player's to revoke. */
export interface Track {
  callId: string;
  src: string;
  title: string;
  durationSec: number;
}

export interface PlaybackSlot {
  audio: RefObject<HTMLAudioElement | null>;
  track: Track | null;
  setTrack(track: Track | null): void;
}

const PlaybackContext = createContext<PlaybackSlot | null>(null);

/**
 * One audio element for the whole app shell, so a recording keeps playing while the user moves
 * between pages. Locking unmounts the shell, which pauses the element, and revokes every Blob
 * URL. The controls live in `use-playback.ts`, loaded only where something plays.
 */
export function PlaybackProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [track, setTrack] = useState<Track | null>(null);
  return (
    <PlaybackContext.Provider value={{ audio, track, setTrack }}>
      {children}
      {/* biome-ignore lint/a11y/useMediaCaption: the call's transcript is the text */}
      <audio ref={audio} data-playback="" preload="metadata" hidden />
    </PlaybackContext.Provider>
  );
}

export function usePlaybackSlot(): PlaybackSlot {
  const p = useContext(PlaybackContext);
  if (!p) throw new Error('usePlaybackSlot is only available inside the app shell');
  return p;
}
