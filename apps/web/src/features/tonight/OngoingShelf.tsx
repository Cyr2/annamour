import type { SessionSummary } from "@annamour/protocol";
import { ChevronRight, Play } from "lucide-react";
import { Link } from "wouter";
import { sessionPath } from "../../sync/restart.ts";
import { SeanceOptions } from "../sessions/SeanceOptions.tsx";
import { SeancePoster } from "../sessions/SeancePoster.tsx";
import { companionsLabel, queuePlace, remainingLabel, sessionTitle } from "../sessions/session-rules.ts";

/** « Autres en cours »: the séances left unfinished besides the one offered first, as posters like the list's. */
export function OngoingShelf({ sessions }: { sessions: SessionSummary[] }) {
  if (sessions.length === 0) return null;
  return (
    <section className="grid gap-1" aria-labelledby="ongoing-title">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id="ongoing-title" className="type-heading">
          Autres en cours
        </h2>
        <Link
          href="/seances?depuis=soir"
          className="flex min-h-11 items-center gap-1 text-sm font-semibold text-accent"
        >
          Toutes les séances
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
      <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 py-2 [scrollbar-width:none]">
        {sessions.map((session) => (
          <li key={session.code} className="relative w-[7.5rem] shrink-0">
            <OngoingTile session={session} />
            {/* Beside the link, not inside it: a button never nests in a link. */}
            <span className="absolute top-1 right-1">
              <SeanceOptions session={session} variant="glass" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OngoingTile({ session }: { session: SessionSummary }) {
  const detail = queuePlace(session) || remainingLabel(session);
  return (
    <Link href={sessionPath(session.code)} className="am-press grid gap-2 rounded-control text-left">
      <SeancePoster session={session} className="w-full">
        <span className="absolute inset-0 m-auto grid size-11 place-items-center rounded-full bg-scrim text-fg">
          <Play className="ml-0.5 size-4 fill-current" />
        </span>
      </SeancePoster>
      <span className="grid gap-0.5 px-0.5">
        <span className="truncate text-sm font-semibold text-fg">{sessionTitle(session)}</span>
        <span className="truncate text-xs text-fg-muted">
          {[detail, companionsLabel(session)].filter(Boolean).join(" · ")}
        </span>
      </span>
    </Link>
  );
}
