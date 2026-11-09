import { LogOut, Plus, RotateCcw, SkipForward } from "lucide-react";
import { useId } from "react";
import { Button } from "../../ui/controls.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { useTv } from "../tv/tv-context.ts";
import type { EpisodeEnd } from "./episode-rules.ts";

type End = Exclude<EpisodeEnd, null>;

interface TogetherActionsProps {
  end: End;
  /** The séance is on a series: what to add next is its next episode. */
  series: boolean;
  onStartNext: () => void;
  onDecline: () => void;
  onAddNext: () => void;
  onWatchAgain: () => void;
}

/**
 * What one person picks for everyone: the next episode, « Pas ce soir », adding
 * what follows, watching again. Grouped under « Pour tout le monde », so nobody
 * takes it for a choice of their own.
 */
export function TogetherActions({
  end,
  series,
  onStartNext,
  onDecline,
  onAddNext,
  onWatchAgain,
}: TogetherActionsProps) {
  const tv = useTv();
  const labelId = useId();
  const canAdd = end === "nothing-next" && !tv;
  return (
    <section aria-labelledby={labelId} className="grid gap-3">
      <h3 id={labelId} className="type-label">
        Pour tout le monde
      </h3>
      {end === "nothing-next" ? null : (
        <Button variant="filled" size="large" icon={<SkipForward />} onClick={onStartNext} data-tv-primary>
          Lancer pour tout le monde
        </Button>
      )}
      {end === "countdown" ? (
        <Button size="large" onClick={onDecline}>
          Pas ce soir
        </Button>
      ) : null}
      {canAdd ? (
        <Button variant="filled" size="large" icon={<Plus />} onClick={onAddNext}>
          {series ? "Ajouter l'épisode suivant" : "Ajouter un film ou un épisode"}
        </Button>
      ) : null}
      {end === "countdown" ? null : (
        <Button
          size="large"
          icon={<RotateCcw />}
          onClick={onWatchAgain}
          data-tv-primary={end === "nothing-next" ? "" : undefined}
        >
          Revoir
        </Button>
      )}
    </section>
  );
}

/** Only for me: back home, while the séance goes on for whoever stays. */
export function LeaveAction({ othersStay }: { othersStay: boolean }) {
  return (
    <div className="grid justify-items-center gap-2 border-line border-t pt-4">
      <LinkButton href="/" size="large" icon={<LogOut />} className="w-full">
        Quitter le salon
      </LinkButton>
      {othersStay ? <p className="type-label">Juste pour toi{" "}: les autres continuent.</p> : null}
    </div>
  );
}
