import type { WatchlistItem } from "@annamour/protocol";
import { Check, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/controls.tsx";
import { Poster } from "../../ui/Poster.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { toast } from "../../ui/toast.ts";
import { describeTitle } from "../home/create/CatalogResults.tsx";
import { EpisodePicker } from "../home/create/EpisodePicker.tsx";
import { ResumeSeanceAction } from "../sessions/ResumeSeanceAction.tsx";
import { useSeanceOfTitle } from "../sessions/useSeanceOfTitle.ts";
import { useLaunchTitle } from "./useLaunchTitle.ts";
import { WantToggle } from "./WantToggle.tsx";
import { markWatched, removeItem, toggleWant } from "./watchlist.ts";
import { audienceLine } from "./watchlist-rules.ts";

interface WatchlistItemSheetProps {
  item: WatchlistItem | null;
  me: string;
  onClose: () => void;
}

/** A title's sheet: who added it and for whom, who wants it, and the ways forward. */
export function WatchlistItemSheet({ item, me, onClose }: WatchlistItemSheetProps) {
  return (
    <Sheet open={item !== null} onClose={onClose} title={item?.title.title ?? ""}>
      {item ? <ItemBody item={item} me={me} onClose={onClose} /> : null}
    </Sheet>
  );
}

function ItemBody({ item, me, onClose }: { item: WatchlistItem; me: string; onClose: () => void }) {
  const [pickingEpisode, setPickingEpisode] = useState(false);
  const { launch, busy, error } = useLaunchTitle();
  const ongoing = useSeanceOfTitle(item.title);
  const watched = item.watchedAt !== undefined;
  const act = (work: Promise<void>, done?: string) =>
    work
      .then(() => (done ? toast({ message: done }) : undefined))
      .catch((failure: Error) => toast({ message: failure.message }));

  if (pickingEpisode) {
    return (
      <EpisodePicker
        show={item.title}
        onBack={() => setPickingEpisode(false)}
        onPick={(season, episode) => void launch(item, { season, episode })}
      />
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex min-w-0 gap-4">
        <Poster title={item.title} size="large" />
        <div className="grid min-w-0 flex-1 content-start justify-items-start gap-2 text-sm text-fg-muted">
          <p>{describeTitle(item.title)}</p>
          <p>{audienceLine(item, me)}</p>
          <WantToggle item={item} me={me} onToggle={(want) => void act(toggleWant(item.id, me, want))} />
        </div>
      </div>
      <p role="alert" className="min-h-5 text-sm text-danger">
        {busy ? (
          <span className="flex items-center gap-3 text-fg-muted">
            <ThreadSpinner /> On prépare la séance…
          </span>
        ) : (
          (error ?? "")
        )}
      </p>
      <div className="grid gap-3">
        {/* A séance already under way comes first: starting a second one is rarely what was meant. */}
        {ongoing ? <ResumeSeanceAction session={ongoing} /> : null}
        <Button
          variant={ongoing ? undefined : "filled"}
          size={ongoing ? undefined : "large"}
          icon={ongoing ? <Plus /> : <Play />}
          disabled={busy}
          onClick={() => (item.title.type === "tv" ? setPickingEpisode(true) : void launch(item))}
          data-tv-primary={ongoing ? undefined : true}
        >
          {ongoing ? "Nouvelle séance" : "Lancer une séance"}
        </Button>
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <Button
            icon={watched ? <RotateCcw /> : <Check />}
            onClick={() =>
              void act(markWatched(item.id, !watched), watched ? "Remis dans « À voir »" : "Rangé dans « Déjà vus »")
            }
          >
            {watched ? "Pas encore vu" : "C'est vu"}
          </Button>
          <Button
            tone="destructive"
            icon={<Trash2 />}
            onClick={() => {
              onClose();
              void act(removeItem(item.id), `« ${item.title.title} » retiré de la liste`);
            }}
          >
            Retirer
          </Button>
        </div>
      </div>
    </div>
  );
}
