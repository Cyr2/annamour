import type { Circle, Suggestion } from "@annamour/protocol";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/controls.tsx";
import { Poster } from "../../ui/Poster.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { toast } from "../../ui/toast.ts";
import { circleShortName } from "../circles/circle-rules.ts";
import { describeTitle } from "../home/create/CatalogResults.tsx";
import { TitleRatings } from "../ratings/TitleRatings.tsx";
import { addTitle } from "../watchlist/watchlist.ts";
import { reasonLine } from "./suggestion-rules.ts";

interface SuggestionSheetProps {
  suggestion: Suggestion | null;
  circle: Circle;
  me: string;
  onClose: () => void;
}

/**
 * A suggestion not in the circle's list yet (loved by someone elsewhere): why
 * it is there, the avis given on it, and « Ajouter à Notre liste », with my wish.
 */
export function SuggestionSheet({ suggestion, circle, me, onClose }: SuggestionSheetProps) {
  const [busy, setBusy] = useState(false);
  const add = async (suggested: Suggestion) => {
    setBusy(true);
    try {
      await addTitle({ title: suggested.title, shareWith: "everyone", want: true, circleId: circle.id });
      toast({ message: `« ${suggested.title.title} » est dans Notre liste` });
      onClose();
    } catch (failure) {
      toast({ message: failure instanceof Error ? failure.message : "Réessaie dans un instant." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={suggestion !== null} onClose={onClose} title={suggestion?.title.title ?? ""}>
      {suggestion ? (
        <div className="grid gap-5">
          <div className="flex min-w-0 gap-4">
            <Poster title={suggestion.title} size="large" />
            <div className="grid min-w-0 flex-1 content-start gap-2 text-sm text-fg-muted">
              <p>{describeTitle(suggestion.title)}</p>
              {suggestion.reasons.map((reason) => (
                <p key={reason.kind} className="text-fg">
                  {reasonLine(reason, me)}
                </p>
              ))}
            </div>
          </div>
          <TitleRatings title={suggestion.title} askMine={false} />
          <Button variant="filled" size="large" icon={<Plus />} disabled={busy} onClick={() => void add(suggestion)}>
            Ajouter à Notre liste · {circleShortName(circle, me)}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
