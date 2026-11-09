import type { PlayCatalogRequest, SessionSummary } from "@annamour/protocol";
import { useState } from "react";
import { Sheet } from "../../../ui/Sheet.tsx";
import { ThreadSpinner } from "../../../ui/ThreadSpinner.tsx";
import { seanceOfTitle } from "../../sessions/session-rules.ts";
import { useSessions } from "../../sessions/sessions.ts";
import { CatalogForm } from "./CatalogForm.tsx";
import { ExistingSeanceStep } from "./ExistingSeanceStep.tsx";
import { LinkForm } from "./LinkForm.tsx";
import { useCreateSession } from "./useCreateSession.ts";

/* « Créer une séance »: find a title by name (or paste a link), we import it, then the salon opens. */

export function CreateSessionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, prepare, prepareFromCatalog, reset } = useCreateSession();
  const [byLink, setByLink] = useState(false);
  const [existing, setExisting] = useState<{ session: SessionSummary; play: PlayCatalogRequest } | null>(null);

  const close = () => {
    onClose();
    reset();
    setByLink(false);
    setExisting(null);
  };
  // A title with a séance under way offers it first, rather than a second séance of the same film.
  const play = (request: PlayCatalogRequest) => {
    const session = seanceOfTitle(useSessions.getState().sessions, request);
    if (session) setExisting({ session, play: request });
    else prepareFromCatalog(request);
  };

  return (
    <Sheet open={open} onClose={close} title="Nouvelle séance">
      {existing ? (
        <ExistingSeanceStep
          session={existing.session}
          onBack={() => setExisting(null)}
          onNew={() => {
            setExisting(null);
            prepareFromCatalog(existing.play);
          }}
        />
      ) : null}
      {state.step === "link" && !byLink && !existing ? (
        <CatalogForm error={state.error} onPlay={play} onPasteLink={() => setByLink(true)} onCancel={close} />
      ) : null}
      {state.step === "link" && byLink ? (
        <LinkForm error={state.error} onSubmit={prepare} onCancel={() => setByLink(false)} />
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
