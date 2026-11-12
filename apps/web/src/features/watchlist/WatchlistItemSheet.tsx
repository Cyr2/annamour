import type { WatchlistItem } from "@annamour/protocol";
import { Play, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/controls.tsx";
import { Poster } from "../../ui/Poster.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { toast } from "../../ui/toast.ts";
import { describeTitle } from "../home/create/CatalogResults.tsx";
import { EpisodePicker } from "../home/create/EpisodePicker.tsx";
import { TitleRatings } from "../ratings/TitleRatings.tsx";
import { ResumeSeanceAction } from "../sessions/ResumeSeanceAction.tsx";
import { useSeanceOfTitle } from "../sessions/useSeanceOfTitle.ts";
import { useLaunchTitle } from "./useLaunchTitle.ts";
import { WantToggle } from "./WantToggle.tsx";
import { ConfirmRemoval, removeForEveryone, WatchlistItemActions } from "./WatchlistItemActions.tsx";
import { toggleWant } from "./watchlist.ts";
import { audienceLine, watchedHowLine } from "./watchlist-rules.ts";

interface WatchlistItemSheetProps {
  item: WatchlistItem | null;
  me: string;
  onClose: () => void;
}

/** A title's sheet: who added it and for whom, who wants it, and the ways forward. */
export function WatchlistItemSheet({ item, me, onClose }: WatchlistItemSheetProps) {
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const close = () => {
    setConfirmingRemoval(false);
    onClose();
  };
  const confirming = confirmingRemoval && item !== null;
  return (
    <Sheet open={item !== null} onClose={close} title={confirming ? "Retirer pour tous ?" : (item?.title.title ?? "")}>
      {item && confirmingRemoval ? (
        <ConfirmRemoval
          item={item}
          me={me}
          onCancel={() => setConfirmingRemoval(false)}
          onConfirm={() => removeForEveryone(item, me, close)}
        />
      ) : null}
      {item && !confirmingRemoval ? (
        <ItemBody item={item} me={me} onClose={close} onConfirmRemoval={() => setConfirmingRemoval(true)} />
      ) : null}
    </Sheet>
  );
}

interface ItemBodyProps {
  item: WatchlistItem;
  me: string;
  onClose: () => void;
  onConfirmRemoval: () => void;
}

function ItemBody({ item, me, onClose, onConfirmRemoval }: ItemBodyProps) {
  const [pickingEpisode, setPickingEpisode] = useState(false);
  const { launch, busy, error } = useLaunchTitle();
  const ongoing = useSeanceOfTitle(item.title, item.circleId);
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
          {item.watchedAt === undefined ? null : <p>{watchedHowLine(item, me, Date.now())}</p>}
          <WantToggle item={item} me={me} onToggle={(want) => void act(toggleWant(item.id, me, want))} />
        </div>
      </div>
      {/* Once seen, each says how they found it; before, the avis of those who saw it elsewhere still help choose. */}
      <TitleRatings title={item.title} askMine={item.watchedAt !== undefined} />
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
      </div>
      <WatchlistItemActions item={item} me={me} onConfirmRemoval={onConfirmRemoval} onClose={onClose} />
    </div>
  );
}
