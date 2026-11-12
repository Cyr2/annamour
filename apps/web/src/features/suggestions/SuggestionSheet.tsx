import type { Circle, GroupSuggestion } from "@annamour/protocol";
import { Play, Plus } from "lucide-react";
import { useState } from "react";
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
import { matchLine, reasonLine } from "./suggestion-rules.ts";

interface SuggestionSheetProps {
  suggestion: GroupSuggestion | null;
  circle: Circle;
  me: string;
  onClose: () => void;
}

/**
 * A suggestion not in the circle's list: how well it suits each one and why,
 * what TMDB says of it, the avis given on it, then « Lancer » or « Ajouter à Notre liste ».
 */
export function SuggestionSheet({ suggestion, circle, me, onClose }: SuggestionSheetProps) {
  return (
    <Sheet open={suggestion !== null} onClose={onClose} title={suggestion?.title.title ?? ""}>
      {suggestion ? <SuggestionBody suggestion={suggestion} circle={circle} me={me} onClose={onClose} /> : null}
    </Sheet>
  );
}

function SuggestionBody({ suggestion, circle, me, onClose }: SuggestionSheetProps & { suggestion: GroupSuggestion }) {
  const [adding, setAdding] = useState(false);
  const [pickingEpisode, setPickingEpisode] = useState(false);
  const { launch, busy, error } = useLaunchTitle();
  const { title } = suggestion;
  const forCircle = { title, circleId: circle.id };
  const match = matchLine(suggestion, me);

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
              {reasonLine(reason, me)}
            </p>
          ))}
        </div>
      </div>
      <TitleDetailsSection title={title} />
      <TitleRatings title={title} askMine={false} />
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
        <Button
          variant="filled"
          size="large"
          icon={<Play />}
          disabled={busy}
          onClick={() => (title.type === "tv" ? setPickingEpisode(true) : void launch(forCircle))}
        >
          Lancer une séance
        </Button>
        <Button icon={<Plus />} disabled={adding} onClick={() => void add()}>
          {adding ? "Ajout…" : `Ajouter à Notre liste · ${circleShortName(circle, me)}`}
        </Button>
      </div>
    </div>
  );
}
