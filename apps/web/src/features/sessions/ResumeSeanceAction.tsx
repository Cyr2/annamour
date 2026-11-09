import type { SessionSummary } from "@annamour/protocol";
import { Play } from "lucide-react";
import { sessionPath } from "../../sync/restart.ts";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { resumeLine } from "./session-rules.ts";

/**
 * « Reprendre la séance » where a title would start a new one: the séance
 * already under way comes first, with where it stopped and with whom.
 */
export function ResumeSeanceAction({ session }: { session: SessionSummary }) {
  return (
    <div className="grid gap-2">
      <LinkButton href={sessionPath(session.code)} variant="filled" size="large" icon={<Play />}>
        Reprendre la séance
      </LinkButton>
      <p className="text-center text-xs text-fg-muted">{resumeLine(session, Date.now())}</p>
    </div>
  );
}
