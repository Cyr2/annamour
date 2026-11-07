import type { SessionSummary } from "@annamour/protocol";
import { useMemo } from "react";
import { plural } from "../../lib/format.ts";
import { sessionPath } from "../../sync/restart.ts";
import type { StackedPerson } from "../../ui/BubbleStack.tsx";
import { GlassLink } from "../../ui/GlassLink.tsx";
import { useAccount } from "../account/account.ts";
import { SessionDetails } from "../profile/SessionRow.tsx";
import { isFinished } from "../sessions/session-rules.ts";
import { useSessions } from "../sessions/sessions.ts";
import { ResumeSlot } from "./ResumeSlot.tsx";

const CREATE_HINT = "Pour créer une séance, colle le lien sur ton téléphone : elle apparaîtra ici.";

/**
 * The home screen's lower half on a TV: the « Reprendre » card alone in the
 * middle (joining with a code sits in the top bar), then « Mes séances » as a
 * row to browse with ← →.
 * Creating a séance stays on the phone (pasting a link with a remote is no fun).
 */
export function TvHomeShelf() {
  const sessions = useSessions((s) => s.sessions);
  return (
    <div className="grid w-full justify-items-center gap-6">
      <ResumeSlot className="w-[min(36rem,100%)]" />
      {sessions.length > 0 ? (
        <TvSessions sessions={sessions} />
      ) : (
        <p className="text-sm text-fg-muted">{CREATE_HINT}</p>
      )}
    </div>
  );
}

function TvSessions({ sessions }: { sessions: readonly SessionSummary[] }) {
  const name = useAccount((s) => s.account?.name);
  const color = useAccount((s) => s.account?.color);
  const id = useAccount((s) => s.account?.id);
  const me = useMemo<StackedPerson | null>(() => (id && name && color ? { id, name, color } : null), [id, name, color]);
  if (!me) return null;

  return (
    <section className="grid w-full gap-1 text-left" aria-labelledby="tv-sessions-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-1">
        <div className="flex items-baseline gap-3">
          <h2 id="tv-sessions-title" className="type-heading">
            Mes séances
          </h2>
          <span className="text-xs text-fg-muted">{plural(sessions.length, "séance")}</span>
        </div>
        <p className="text-xs text-fg-muted">{CREATE_HINT}</p>
      </div>
      {/* Room around the cards for the focus ring and lift: a scroller clips what overflows it. */}
      <ul className="-mx-6 flex gap-5 overflow-x-auto px-6 py-5 [scrollbar-width:none]">
        {sessions.map((session) => (
          <li key={session.code} className="shrink-0">
            <TvSessionCard session={session} me={me} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TvSessionCard({ session, me }: { session: SessionSummary; me: StackedPerson }) {
  return (
    <GlassLink
      href={sessionPath(session.code, isFinished(session))}
      material="frost"
      className="surface-panel w-[26rem]"
      linkClassName="block p-5 text-left"
    >
      {/* Spoken first, then the card as seen: the name says what pressing OK does and still matches the screen. */}
      <span className="sr-only">{isFinished(session) ? "Revoir : " : "Reprendre : "}</span>
      <SessionDetails session={session} me={me} now={Date.now()} />
    </GlassLink>
  );
}
