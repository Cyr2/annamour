import type { RoomSnapshot } from "@annamour/protocol";
import { Check, Play, X } from "lucide-react";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { cx } from "../../ui/cx.ts";
import { IconButton } from "../../ui/IconButton.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { useTv } from "../tv/tv-context.ts";
import { AddToQueue } from "./AddToQueue.tsx";
import { episodeName, episodeState, onSeries, queueTitle } from "./episode-rules.ts";

interface EpisodesSheetProps {
  open: boolean;
  onClose: () => void;
  room: RoomSnapshot;
  client: SyncClient | null;
}

const STATE_TEXT = { watched: "Vu", current: "En cours", upcoming: "Ensuite" } as const;

/** A single video has nothing to pick yet: the sheet is where what follows gets added (from a phone, not a TV). */
function queueLede(room: RoomSnapshot, tv: boolean): string {
  if (room.episodes.length > 1) {
    return `Choisis ${onSeries(room) ? "un épisode" : "un film"} : il démarre pour tout le monde.`;
  }
  return tv
    ? "Ajoute la suite depuis ton téléphone."
    : "Ajoute ce que vous regarderez ensuite : ça démarrera pour tout le monde.";
}

/**
 * « Épisodes » (« File » for films): every episode of the séance, the watched ones ticked. Tapping
 * one takes everyone there (the next one, a later one, or one to watch again).
 * A phone or a computer also adds what follows (next episode, a title, a link); a TV only picks.
 */
export function EpisodesSheet({ open, onClose, room, client }: EpisodesSheetProps) {
  const tv = useTv();
  const play = (to: number) => {
    client?.send({ type: "playEpisode", from: room.current, to });
    onClose();
  };
  const title = queueTitle(room);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <Sheet.Lede>{queueLede(room, tv)}</Sheet.Lede>
      <ol
        aria-label={`${title} de la séance`}
        className="grid max-h-[40dvh] grid-cols-[minmax(0,1fr)] gap-2 overflow-y-auto p-1"
      >
        {room.episodes.map((_, index) => {
          const state = episodeState(index, room.current);
          // A single film is the video on screen: its title is the séance's.
          const name = episodeName(room.episodes, index, room.media.title);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: an episode is its place in the séance.
            <li key={index} className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                disabled={state === "current"}
                aria-current={state === "current" ? "true" : undefined}
                aria-label={state === "current" ? `${name}, en cours` : `Regarder ${name}, ${STATE_TEXT[state]}`}
                onClick={() => play(index)}
                className={cx(
                  "surface-tile flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 px-3.5 py-2 text-left transition-colors",
                  "enabled:hover:bg-fill-hover disabled:cursor-default",
                )}
              >
                <EpisodeMark state={state} number={index + 1} />
                <span className="grid min-w-0 flex-1">
                  <b className="truncate text-sm font-semibold text-fg">{name}</b>
                  <small className="text-xs text-fg-muted">{STATE_TEXT[state]}</small>
                </span>
              </button>
              {state === "upcoming" ? (
                <IconButton
                  label={`Retirer ${name} de la suite`}
                  icon={<X />}
                  onClick={() => client?.send({ type: "removeEpisode", episode: index })}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {tv ? null : <AddToQueue key={room.episodes.length} room={room} onDone={onClose} />}
    </Sheet>
  );
}

function EpisodeMark({ state, number }: { state: ReturnType<typeof episodeState>; number: number }) {
  return (
    <span
      aria-hidden
      className={cx(
        "grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold",
        state === "watched" ? "bg-success text-on-accent" : "bg-fill-strong text-fg",
      )}
    >
      {state === "watched" ? <Check className="size-4" strokeWidth={3} /> : null}
      {state === "current" ? <Play className="size-3.5 fill-current" /> : null}
      {state === "upcoming" ? number : null}
    </span>
  );
}
