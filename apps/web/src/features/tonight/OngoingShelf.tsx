import type { SessionSummary } from "@annamour/protocol";
import { Play } from "lucide-react";
import { Link } from "wouter";
import { sessionPath } from "../../sync/restart.ts";
import { companionsLabel, progressOf, remainingLabel, sessionTitle } from "../sessions/session-rules.ts";

/** « Autres en cours »: the séances left unfinished besides the one offered first, as posters like the list's. */
export function OngoingShelf({ sessions }: { sessions: SessionSummary[] }) {
  if (sessions.length === 0) return null;
  return (
    <section className="grid gap-1" aria-labelledby="ongoing-title">
      <h2 id="ongoing-title" className="type-heading px-1">
        Autres en cours
      </h2>
      <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 py-2 [scrollbar-width:none]">
        {sessions.map((session) => (
          <li key={session.code} className="w-[7.5rem] shrink-0">
            <OngoingTile session={session} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function OngoingTile({ session }: { session: SessionSummary }) {
  const progress = progressOf(session) ?? 0;
  const detail =
    session.episode.count > 1
      ? `épisode ${session.episode.index + 1} sur ${session.episode.count}`
      : remainingLabel(session);
  return (
    <Link href={sessionPath(session.code)} className="grid gap-2 rounded-control text-left">
      <span
        aria-hidden
        className="relative block aspect-[2/3] w-full overflow-hidden rounded-control"
        style={{ background: "var(--am-poster-glow), var(--am-poster)" }}
      >
        <span className="absolute inset-0 m-auto grid size-11 place-items-center rounded-full bg-scrim text-fg">
          <Play className="ml-0.5 size-4 fill-current" />
        </span>
        <span className="absolute inset-x-0 bottom-0 h-1 bg-fill-strong">
          <span className="block h-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      </span>
      <span className="grid gap-0.5 px-0.5">
        <span className="truncate text-sm font-semibold text-fg">{sessionTitle(session)}</span>
        <span className="truncate text-xs text-fg-muted">
          {[detail, companionsLabel(session)].filter(Boolean).join(" · ")}
        </span>
      </span>
    </Link>
  );
}
