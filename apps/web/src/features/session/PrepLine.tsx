import type { PrepStatus } from "@annamour/protocol";
import { CircleCheck } from "lucide-react";
import { Progress } from "../../ui/Progress.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { prepProgress, prepReady } from "./prep.ts";

/**
 * Under « Lancer le film »: the server preparing the film for small
 * connections, then « prête ». Nothing when the film needs no preparing.
 */
export function PrepLine({ status }: { status: PrepStatus | null }) {
  if (!status?.available) return null;

  if (prepReady(status)) {
    return (
      <p className="flex items-center gap-2 text-sm text-fg-muted" role="status">
        <CircleCheck aria-hidden className="size-4 shrink-0 text-success" />
        Vidéo prête pour toutes les connexions
      </p>
    );
  }

  const percent = Math.round(prepProgress(status) * 100);
  return (
    <div className="grid w-[min(22.5rem,100%)] gap-2" role="status" aria-live="polite">
      <p className="flex items-center justify-center gap-2 text-sm text-pretty text-fg-muted">
        <ThreadSpinner className="size-4 shrink-0" />
        Préparation de la vidéo pour les petites connexions… {percent} %
      </p>
      <Progress.Bar value={prepProgress(status)} label={`Vidéo préparée à ${percent} %`} />
    </div>
  );
}
