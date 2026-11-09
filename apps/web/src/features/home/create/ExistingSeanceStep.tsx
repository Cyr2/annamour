import type { SessionSummary } from "@annamour/protocol";
import { ChevronLeft, Plus } from "lucide-react";
import { Button } from "../../../ui/controls.tsx";
import { Sheet } from "../../../ui/Sheet.tsx";
import { ResumeSeanceAction } from "../../sessions/ResumeSeanceAction.tsx";
import { SeancePoster } from "../../sessions/SeancePoster.tsx";
import { sessionTitle } from "../../sessions/session-rules.ts";

interface ExistingSeanceStepProps {
  session: SessionSummary;
  onNew: () => void;
  onBack: () => void;
}

/** The title picked already has a séance under way: go back to it first, or start another on purpose. */
export function ExistingSeanceStep({ session, onNew, onBack }: ExistingSeanceStepProps) {
  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-4">
        <SeancePoster session={session} className="w-16 shrink-0" />
        <Sheet.Lede>
          « {sessionTitle(session)} » a déjà une séance en cours. Vous la reprenez là où vous en étiez ?
        </Sheet.Lede>
      </div>
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
