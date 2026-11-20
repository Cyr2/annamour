import type { Circle, GroupSuggestion } from "@annamour/protocol";
import { EyeOff, Play, Plus } from "lucide-react";
import { useState } from "react";
import { dismissSuggestion } from "../../api/suggestions.ts";
import { Button } from "../../ui/controls.tsx";
import { Poster } from "../../ui/Poster.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { toast } from "../../ui/toast.ts";
import { circleShortName } from "../circles/circle-rules.ts";
import { TitleDetailsSection } from "../details/TitleDetailsSection.tsx";
import { describeTitle } from "../home/create/CatalogResults.tsx";
import { EpisodePicker } from "../home/create/EpisodePicker.tsx";
import { TitleRatings } from "../ratings/TitleRatings.tsx";
import { useLaunchTitle } from "../watchlist/useLaunchTitle.ts";
import { addTitle } from "../watchlist/watchlist.ts";
import { perfectLabel, reasonLine } from "./suggestion-rules.ts";

interface SuggestionSheetProps {
  suggestion: GroupSuggestion | null;
  circle: Circle;
  me: string;
  onClose: () => void;
  /** « Pas pour nous » was said: the shelf asks again. */
  onDismissed: () => void;
}

/**
 * A suggestion not in the circle's list: why it is there (and whether it suits
 * everyone), what TMDB says of it, the avis given on it, then « Lancer »,
 * « Ajouter à Notre liste » or « Pas pour nous ».
 */
export function SuggestionSheet({ suggestion, circle, me, onClose, onDismissed }: SuggestionSheetProps) {
  return (
    <Sheet open={suggestion !== null} onClose={onClose} title={suggestion?.title.title ?? ""}>
      {suggestion ? (
        <SuggestionBody suggestion={suggestion} circle={circle} me={me} onClose={onClose} onDismissed={onDismissed} />
      ) : null}
    </Sheet>
  );
}

function SuggestionBody({
  suggestion,
  circle,
  me,
  onClose,
  onDismissed,
}: SuggestionSheetProps & { suggestion: GroupSuggestion }) {
  const [adding, setAdding] = useState(false);
  const [pickingEpisode, setPickingEpisode] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const { launch, busy, error } = useLaunchTitle();
  const { title } = suggestion;
  const forCircle = { title, circleId: circle.id };
  const match = suggestion.perfect ? perfectLabel(circle.members.length) : "";

  const add = async () => {
    setAdding(true);
    try {
      await addTitle({ title, shareWith: "everyone", want: true, circleId: circle.id });
      toast({ message: `« ${title.title} » est dans Notre liste` });
      onClose();
    } catch (failure) {
      toast({ message: failure instanceof Error ? failure.message : "Réessaie dans un instant." });
    } finally {
      setAdding(false);
    }
  };

  const dismiss = async (tmdbId: number) => {
    setDismissing(true);
    try {
      await dismissSuggestion(circle.id, { type: title.type, tmdbId });
      toast({ message: `« ${title.title} » ne sera plus proposé` });
      onDismissed();
      onClose();
    } catch (failure) {
      toast({ message: failure instanceof Error ? failure.message : "Réessaie dans un instant." });
      setDismissing(false);
    }
  };

  if (pickingEpisode) {
    return (
      <EpisodePicker
        show={title}
        onBack={() => setPickingEpisode(false)}
        onPick={(season, episode) => void launch(forCircle, { season, episode })}
      />
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex min-w-0 gap-4">
        <Poster title={title} size="large" />
        <div className="grid min-w-0 flex-1 content-start gap-2 text-sm text-fg-muted">
          <p>{describeTitle(title)}</p>
          {match ? <p className="font-semibold text-accent">{match}</p> : null}
          {suggestion.reasons.map((reason) => (
            <p key={reason.kind} className="text-fg">
              {reasonLine(reason, me, title.type)}
            </p>
          ))}
        </div>
      </div>
      <TitleDetailsSection title={title} />
      <TitleRatings title={title} askMine={false} />
      <p role="alert" className="text-sm text-danger empty:hidden">
        {busy ? (
          <span className="flex items-center gap-3 text-fg-muted">
            <ThreadSpinner /> On prépare la séance…
          </span>
        ) : (
          (error ?? "")
        )}
      </p>
      <div className="grid gap-3">
        <Button
          variant="filled"
          size="large"
          icon={<Play />}
          disabled={busy}
          data-tv-primary
          onClick={() => (title.type === "tv" ? setPickingEpisode(true) : void launch(forCircle))}
        >
          Lancer une séance
        </Button>
        <Button icon={<Plus />} disabled={adding} onClick={() => void add()}>
          {adding ? "Ajout…" : `Ajouter à Notre liste · ${circleShortName(circle, me)}`}
        </Button>
        {title.tmdbId !== undefined ? (
          <Button
            icon={<EyeOff />}
            disabled={dismissing}
            onClick={() => title.tmdbId !== undefined && void dismiss(title.tmdbId)}
          >
            Pas pour nous
          </Button>
        ) : null}
      </div>
    </div>
  );
}
