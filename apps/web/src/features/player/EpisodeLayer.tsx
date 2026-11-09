import { AnimatePresence } from "motion/react";
import { useEffect } from "react";
import { useRoom } from "../../sync/room.ts";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { toast } from "../../ui/toast.ts";
import { EpisodeEndScreen } from "./EpisodeEndScreen.tsx";
import { EpisodesSheet } from "./EpisodesSheet.tsx";
import { episodeEndOf } from "./episode-rules.ts";
import { describeRoomChange } from "./playback-notice.ts";

interface EpisodeLayerProps {
  /** The film is on screen (not the salon). */
  active: boolean;
  client: SyncClient | null;
  upNextOpen: boolean;
  onUpNextOpenChange: (open: boolean) => void;
  onWatchAgain: () => void;
}

/** Everything about episodes over the film: the end screen and the « Épisodes » sheet. */
export function EpisodeLayer({ active, client, upNextOpen, onUpNextOpenChange, onWatchAgain }: EpisodeLayerProps) {
  const room = useRoom((s) => s.room);
  useEpisodeNotices();
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
      <EpisodesSheet open={upNextOpen} onClose={() => onUpNextOpenChange(false)} room={room} client={client} />
    </>
  );
}

/** Whether the end screen covers the film: the player's own controls then step aside. */
export function useEpisodeOver(): boolean {
  return useRoom((s) => (s.room ? episodeEndOf(s.room) !== null : false));
}

/** Skips everyone to the next episode, mid-way through this one; undefined on the last episode. */
export function useSkipNext(client: SyncClient | null): (() => void) | undefined {
  const current = useRoom((s) => (s.room && s.room.current + 1 < s.room.episodes.length ? s.room.current : null));
  if (current === null || !client) return undefined;
  return () => client.send({ type: "playEpisode", from: current, to: current + 1 });
}

/** « Léo a lancé S1 · É3 », « Inès a retiré S1 · É4 de la file »: what someone else did to the séance's episodes. */
function useEpisodeNotices(): void {
  useEffect(
    () =>
      useRoom.subscribe((state, before) => {
        const event = state.roomEvent;
        if (!event || event === before.roomEvent || !state.room) return;
        const { episodes, current } = state.room;
        const notice = describeRoomChange({ ...event, episodes, current, members: state.members, you: state.you });
        if (notice) toast({ message: notice.message, color: notice.member?.color, name: notice.member?.name });
      }),
    [],
  );
}
