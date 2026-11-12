import type { SessionSummary } from "@annamour/protocol";
import { LogIn } from "lucide-react";
import { sessionPath } from "../../sync/restart.ts";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { hereLine, sessionTitle, waitingSeances } from "../sessions/session-rules.ts";

/** At most this many: a séance under way at once is the rule, two the exception. */
const SHOWN = 2;

/**
 * « En ce moment », first on « Ce soir »: someone of the circle is in a salon
 * now, waiting. One touch joins them, no code: the séance is the circle's.
 */
export function WaitingNow({ sessions }: { sessions: readonly SessionSummary[] }) {
  const waiting = waitingSeances(sessions).slice(0, SHOWN);
  if (waiting.length === 0) return null;
  return (
    <section aria-label="En ce moment" className="grid gap-3">
      {waiting.map((session) => {
        const people = (session.here ?? []).map((person, index) => ({ id: String(index), ...person }));
        return (
          <Surface key={session.code} className="surface-panel flex items-center gap-3 p-4" role="status">
            <BubbleStack people={people} className="shrink-0" />
            <p className="grid min-w-0 flex-1 text-left">
              <span className="truncate text-sm font-semibold text-fg">{sessionTitle(session)}</span>
              <span className="line-clamp-2 text-xs text-fg-muted">{hereLine(session)}</span>
            </p>
            <LinkButton
              href={sessionPath(session.code)}
              variant="filled"
              icon={<LogIn />}
              label={`Rejoindre « ${sessionTitle(session)} »`}
            >
              Rejoindre
            </LinkButton>
          </Surface>
        );
      })}
    </section>
  );
}
