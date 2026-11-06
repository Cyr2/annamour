import { useEffect, useMemo, useState } from "react";
import { initialPlayerSyncState, PlayerSync, type PlayerSyncState } from "./PlayerSync.ts";
import { useRoom, type RoomState } from "./room.ts";
import type { SyncClient } from "./SyncClient.ts";

export interface PlayerControls {
  /** Each returns false when offline (nothing was sent, nothing changed). */
  play: () => boolean;
  pause: () => boolean;
  seek: (position: number) => boolean;
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

  useEffect(() => {
    if (!video || !client) return;
    const sync = new PlayerSync(video, client, setState);
    // Store changes reach the engine directly, without re-rendering React.
    const feed = (room: RoomState) => {
      sync.setSource(room.room?.media.src ?? null);
      sync.setPlayback(room.playback);
    };
    feed(useRoom.getState());
    const unsubscribe = useRoom.subscribe(feed);
    setEngine(sync);
    return () => {
      unsubscribe();
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
            unlock: () => engine.unlock(),
          }
        : offline,
    [engine],
  );

  return { ...state, controls };
}
