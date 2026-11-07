import { AnimatePresence } from "motion/react";
import { useRoom } from "../../sync/room.ts";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { EpisodeEndScreen } from "./EpisodeEndScreen.tsx";
import { episodeEndOf } from "./episode-rules.ts";
import { UpNextSheet } from "./UpNextSheet.tsx";

interface EpisodeLayerProps {
  /** The film is on screen (not the salon). */
  active: boolean;
  client: SyncClient | null;
  upNextOpen: boolean;
  onUpNextOpenChange: (open: boolean) => void;
  onWatchAgain: () => void;
}

/** Everything about episodes over the film: the end screen and the « À suivre » sheet. */
export function EpisodeLayer({ active, client, upNextOpen, onUpNextOpenChange, onWatchAgain }: EpisodeLayerProps) {
  const room = useRoom((s) => s.room);
  if (!room) return null;
  const end = episodeEndOf(room);
  return (
    <>
      <AnimatePresence>
        {active && end ? (
          <EpisodeEndScreen
            key="episode-end"
            end={end}
            room={room}
            client={client}
            onWatchAgain={onWatchAgain}
            onAddNext={() => onUpNextOpenChange(true)}
          />
        ) : null}
      </AnimatePresence>
      <UpNextSheet open={upNextOpen} onClose={() => onUpNextOpenChange(false)} room={room} client={client} />
    </>
  );
}

/** Whether the end screen covers the film: the player's own controls then step aside. */
export function useEpisodeOver(): boolean {
  return useRoom((s) => (s.room ? episodeEndOf(s.room) !== null : false));
}
