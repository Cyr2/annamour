import type { RoomSnapshot } from "@annamour/protocol";
import { Play, X } from "lucide-react";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { IconButton } from "../../ui/IconButton.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { AddToQueue } from "./AddToQueue.tsx";
import { episodeName } from "./episode-rules.ts";

interface UpNextSheetProps {
  open: boolean;
  onClose: () => void;
  room: RoomSnapshot;
  client: SyncClient | null;
}

/** « À suivre »: the episode on screen, the ones queued after it, and what to add next. */
export function UpNextSheet({ open, onClose, room, client }: UpNextSheetProps) {
  const upcoming = room.episodes.map((_, index) => index).filter((index) => index >= room.current);
  return (
    <Sheet open={open} onClose={onClose} title="À suivre">
      <Sheet.Lede>À la fin de l'épisode, la suite démarre pour tout le monde.</Sheet.Lede>
      <ol aria-label="Épisodes à suivre" className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {upcoming.map((index) => (
          <li key={index} className="surface-tile flex min-h-14 min-w-0 items-center gap-3 px-3.5 py-2">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-fill-strong text-xs font-bold text-fg"
            >
              {index === room.current ? <Play className="size-3.5 fill-current" /> : index - room.current + 1}
            </span>
            <span className="grid min-w-0 flex-1">
              <b className="truncate text-sm font-semibold text-fg">{episodeName(room.episodes, index)}</b>
              <small className="text-xs text-fg-muted">{index === room.current ? "En cours" : "Ensuite"}</small>
            </span>
            {index > room.current ? (
              <IconButton
                label={`Retirer ${episodeName(room.episodes, index)} de la suite`}
                icon={<X />}
                onClick={() => client?.send({ type: "removeEpisode", episode: index })}
              />
            ) : null}
          </li>
        ))}
      </ol>
      <AddToQueue key={room.episodes.length} room={room} onDone={onClose} />
    </Sheet>
  );
}
