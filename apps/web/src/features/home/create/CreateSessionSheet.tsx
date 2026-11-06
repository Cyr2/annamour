import { Sheet } from "../../../ui/Sheet.tsx";
import { ThreadSpinner } from "../../../ui/ThreadSpinner.tsx";
import { LinkForm } from "./LinkForm.tsx";
import { ReadyStep } from "./ReadyStep.tsx";
import { useCreateSession } from "./useCreateSession.ts";

/* « Créer une séance »: paste a link, we import it, then choose how you watch. */

export function CreateSessionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, prepare, reset } = useCreateSession();

  const close = () => {
    onClose();
    reset();
  };

  const title = state.step === "ready" ? "C'est prêt" : "Nouvelle séance";

  return (
    <Sheet open={open} onClose={close} title={title}>
      {state.step === "link" ? <LinkForm error={state.error} onSubmit={prepare} onCancel={close} /> : null}
      {state.step === "loading" ? (
        <div className="flex items-center gap-3 px-1 py-[18px] text-fg-muted" role="status">
          <ThreadSpinner />
          On récupère le film, les langues et les sous-titres…
        </div>
      ) : null}
      {state.step === "ready" ? <ReadyStep room={state.room} /> : null}
    </Sheet>
  );
}
