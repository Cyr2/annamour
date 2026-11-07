import type { SessionSummary } from "@annamour/protocol";
import { LogIn } from "lucide-react";
import { useMemo } from "react";
import { plural } from "../../lib/format.ts";
import type { StackedPerson } from "../../ui/BubbleStack.tsx";
import { GlassLink } from "../../ui/GlassLink.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { useAccount } from "../account/account.ts";
import { SessionDetails } from "../profile/SessionRow.tsx";
import { useSessions } from "../sessions/sessions.ts";
import { ResumeSlot } from "./ResumeSlot.tsx";

const CREATE_HINT = "Pour créer une séance, colle le lien sur ton téléphone : elle apparaîtra ici.";

/**
 * The home screen's lower half on a TV: joining with a code next to the
 * « Reprendre » card, then « Mes séances » as a row to browse with ← →.
 * Creating a séance stays on the phone (pasting a link with a remote is no fun).
 */
export function TvHomeShelf() {
  const sessions = useSessions((s) => s.sessions);
  return (
    <div className="grid w-full justify-items-center gap-6">
      <div className="flex w-full flex-wrap items-center justify-center gap-6">
        <div data-tv-primary>
          <LinkButton href="/rejoindre" variant="filled" size="large" icon={<LogIn />}>
            Rejoindre avec un code
          </LinkButton>
        </div>
        <ResumeSlot className="" />
      </div>
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
      href={`/s/${session.code}`}
      material="frost"
      label={`Ouvrir « ${session.title} »`}
      className="surface-panel w-[26rem]"
      linkClassName="block p-5 text-left"
    >
      <SessionDetails session={session} me={me} now={Date.now()} />
    </GlassLink>
  );
}
