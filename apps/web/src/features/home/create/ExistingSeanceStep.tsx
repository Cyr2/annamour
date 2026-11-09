import type { PlayCatalogRequest, SessionSummary } from "@annamour/protocol";
import { ChevronLeft, Plus } from "lucide-react";
import { Button } from "../../../ui/controls.tsx";
import { Sheet } from "../../../ui/Sheet.tsx";
import { ResumeSeanceAction } from "../../sessions/ResumeSeanceAction.tsx";
import { SeancePoster } from "../../sessions/SeancePoster.tsx";
import { chosenEpisodeNote, whereAndWho } from "../../sessions/session-rules.ts";

interface ExistingSeanceStepProps {
  session: SessionSummary;
  /** The title (and episode) picked, to say how it stands against the séance. */
  chosen: PlayCatalogRequest;
  onNew: () => void;
  onBack: () => void;
}

/**
 * The title picked already has a séance under way in this circle: where it is
 * and with whom, to go back to it first, or start another on purpose.
 */
export function ExistingSeanceStep({ session, chosen, onNew, onBack }: ExistingSeanceStepProps) {
  const note = chosenEpisodeNote(session, chosen);
  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-4">
        <SeancePoster session={session} className="w-16 shrink-0" />
        <div className="grid min-w-0 gap-1">
          <Sheet.Lede>« {session.title} » a déjà une séance en cours.</Sheet.Lede>
          <p className="text-sm font-semibold text-fg">{whereAndWho(session)}</p>
        </div>
      </div>
      {note ? <p className="text-sm text-fg-muted">{note}</p> : null}
      <ResumeSeanceAction session={session} />
      <Sheet.Actions>
        <Button icon={<ChevronLeft />} onClick={onBack}>
          Autre titre
        </Button>
        <Button icon={<Plus />} onClick={onNew}>
          Nouvelle séance
        </Button>
      </Sheet.Actions>
    </div>
  );
}
