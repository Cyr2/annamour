import type { AudioTrack } from "@annamour/protocol";
import { useEffect, useMemo, useState } from "react";
import { isFilmDownloaded, onFilmsChanged } from "./film-cache.ts";
import { wantsHevcLadder } from "./hevc-ladder.ts";
import { initialPlayerSyncState, PlayerSync, type PlayerSyncState } from "./PlayerSync.ts";
import { playerChoice } from "./player-choice.ts";
import { type RoomState, useRoom } from "./room.ts";
import type { SyncClient } from "./SyncClient.ts";
import { usePlaybackStats } from "./usePlaybackStats.ts";

export interface PlayerControls {
  /** Each returns false when offline (nothing was sent, nothing changed). */
  play: () => boolean;
  pause: () => boolean;
  seek: (position: number) => boolean;
  /** Personal audio language; never sent to the room. */
  selectAudio: (track: AudioTrack | null) => void;
  /** After `blocked`: call from the tap that should start playback. */
  unlock: () => void;
}

export interface PlayerSyncHandle extends PlayerSyncState {
  controls: PlayerControls;
}

const offline: PlayerControls = {
  play: () => false,
  pause: () => false,
  seek: () => false,
  selectAudio: () => {},
  unlock: () => {},
};

/**
 * Keeps `video` on the room's shared timeline. Pass the element through a
 * callback ref held in state so the hook re-runs when it mounts:
 *
 *   const [video, setVideo] = useState<HTMLVideoElement | null>(null);
 *   const player = usePlayerSync(video, client);
 *   <video ref={setVideo} />
 */
export function usePlayerSync(video: HTMLVideoElement | null, client: SyncClient | null): PlayerSyncHandle {
  const [state, setState] = useState<PlayerSyncState>(initialPlayerSyncState);
  const [engine, setEngine] = useState<PlayerSync | null>(null);
  usePlaybackStats(video, client, state.engine);

  useEffect(() => {
    if (!video || !client) return;
    const sync = new PlayerSync(video, client, setState, {
      fromDevice: isFilmDownloaded,
      ownPlayer: () => playerChoice() === "annamour",
      hevcLadder: () => wantsHevcLadder(),
    });
    // Store changes reach the engine directly, without re-rendering React.
    const feed = (room: RoomState) => {
      sync.setSource(room.room?.media.src ?? null);
      sync.setPlayback(room.playback);
    };
    feed(useRoom.getState());
    const unsubscribe = useRoom.subscribe(feed);
    const offFilms = onFilmsChanged(() => sync.refreshEngine());
    setEngine(sync);
    return () => {
      unsubscribe();
      offFilms();
      sync.destroy();
      setEngine(null);
      setState(initialPlayerSyncState);
    };
  }, [video, client]);

  const controls = useMemo<PlayerControls>(
    () =>
      engine
        ? {
            play: () => engine.play(),
            pause: () => engine.pause(),
            seek: (position) => engine.seek(position),
            selectAudio: (track) => engine.selectAudio(track),
            unlock: () => engine.unlock(),
          }
        : offline,
    [engine],
  );

  return { ...state, controls };
}
