import type { PlayCatalogRequest, SessionSummary } from "@annamour/protocol";
import { useState } from "react";
import { Sheet } from "../../../ui/Sheet.tsx";
import { ThreadSpinner } from "../../../ui/ThreadSpinner.tsx";
import { useAccount } from "../../account/account.ts";
import { seanceToResume } from "../../circles/circle-rules.ts";
import { shownCircle, useCircles } from "../../circles/circles.ts";
import { useSessions } from "../../sessions/sessions.ts";
import { CatalogForm } from "./CatalogForm.tsx";
import { CircleTarget } from "./CircleTarget.tsx";
import { ExistingSeanceStep } from "./ExistingSeanceStep.tsx";
import { LinkForm } from "./LinkForm.tsx";
import { useCreateSession } from "./useCreateSession.ts";

/* « Créer une séance »: for whom, then find a title by name (or paste a link), we import it, then the salon opens. */

export function CreateSessionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, prepare, prepareFromCatalog, reset } = useCreateSession();
  const [byLink, setByLink] = useState(false);
  const [existing, setExisting] = useState<{ session: SessionSummary; play: PlayCatalogRequest } | null>(null);
  // Untouched, the séance goes to the circle on screen; a pick on the sheet holds until it closes.
  const [picked, setPicked] = useState<{ circleId: string | null } | null>(null);
  const shown = useCircles((s) => shownCircle(s));
  const circleId = picked ? picked.circleId : shown;
  const me = useAccount((s) => s.account?.id ?? "");

  const close = () => {
    onClose();
    reset();
    setByLink(false);
    setExisting(null);
    setPicked(null);
  };
  // A title with a séance under way in this circle offers it first, rather than a second séance of the same film.
  const play = (request: PlayCatalogRequest) => {
    const { sessions } = useSessions.getState();
    const session = seanceToResume(request, { sessions, circleId, circles: useCircles.getState().circles, me });
    if (session) setExisting({ session, play: request });
    else prepareFromCatalog(request, circleId);
  };
  const choosing = state.step === "link" && !existing;

  return (
    <Sheet open={open} onClose={close} title="Nouvelle séance">
      {choosing ? <CircleTarget circleId={circleId} onChange={(id) => setPicked({ circleId: id })} /> : null}
      {existing ? (
        <ExistingSeanceStep
          session={existing.session}
          chosen={existing.play}
          onBack={() => setExisting(null)}
          onNew={() => {
            setExisting(null);
            prepareFromCatalog(existing.play, circleId);
          }}
        />
      ) : null}
      {choosing && !byLink ? (
        <CatalogForm error={state.error} onPlay={play} onPasteLink={() => setByLink(true)} onCancel={close} />
      ) : null}
      {state.step === "link" && byLink ? (
        <LinkForm
          error={state.error}
          onSubmit={(url, title) => prepare(url, title, circleId)}
          onCancel={() => setByLink(false)}
        />
      ) : null}
      {state.step === "loading" ? (
        <div className="flex items-center gap-3 px-1 py-[18px] text-fg-muted" role="status">
          <ThreadSpinner />
          On récupère le film, les langues et les sous-titres…
        </div>
      ) : null}
    </Sheet>
  );
}
