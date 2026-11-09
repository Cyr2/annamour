import { circleTitle, type SessionSummary } from "@annamour/protocol";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { BrandFooter } from "../../ui/BrandFooter.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { ScreenTopBar } from "../../ui/ScreenTopBar.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { toast } from "../../ui/toast.ts";
import { useAccount } from "../account/account.ts";
import { ofCircle } from "../circles/circle-rules.ts";
import { loadCircles, useCircles } from "../circles/circles.ts";
import { CREATE_PATH } from "../home/create/create-link.ts";
import { CircleFilter } from "../list/CircleFilter.tsx";
import { SessionRow } from "../profile/SessionRow.tsx";
import { splitByStatus } from "../sessions/session-rules.ts";
import { leaveSession, useSessions } from "../sessions/sessions.ts";
import { useLoadSessions } from "../sessions/useLoadSessions.ts";

/**
 * « Séances »: the evenings watched together, under way then over, for the
 * circle on screen. A séance can hold several films or episodes: here it is
 * one card, the way back in and its « ⋯ » (leave, or delete for everyone).
 */
export function SeancesScreen() {
  useLoadSessions();
  useEffect(() => void loadCircles(), []);
  const params = new URLSearchParams(useSearch());
  const asked = params.get("cercle");
  // Everything unless a circle's « 7 séances » asked for its own: a pick of this page's, so « Toutes mes
  // séances » shows them all, those of a circle left too.
  const [circleId, setCircleId] = useState<string | null>(asked);
  const account = useAccount((s) => s.account);
  const me = account?.id ?? "";
  const circle = useCircles((s) => s.circles.find((c) => c.id === circleId) ?? null);
  const sessions = useSessions((s) => s.sessions);
  const status = useSessions((s) => s.status);
  const { ongoing, finished } = useMemo(() => splitByStatus(ofCircle(sessions, circle, me)), [sessions, circle, me]);
  const meBubble = account ? { id: account.id, name: account.name, color: account.color } : null;

  return (
    <div className="safe-area mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col">
      <main className="mx-auto grid w-full max-w-[760px] content-start gap-6 py-4">
        <ScreenTopBar back={params.get("depuis") === "soir" ? "/" : "/nous"} title={<h1>Séances</h1>} />
        <CircleFilter centered value={circleId} onChange={setCircleId} />
        {status === "loading" || status === "idle" ? (
          <div className="grid place-items-center py-10">
            <ThreadSpinner />
          </div>
        ) : null}
        {status === "ready" && ongoing.length + finished.length === 0 ? (
          <Empty withWhom={circle ? circleTitle(circle, me) : null} />
        ) : null}
        {meBubble ? (
          <>
            <Group title="En cours" sessions={ongoing} me={meBubble} />
            <Group title="Terminées" sessions={finished} me={meBubble} />
          </>
        ) : null}
      </main>
      <BrandFooter />
    </div>
  );
}

type Me = { id: string; name: string; color: SessionSummary["participants"][number]["color"] };

function Group({ title, sessions, me }: { title: string; sessions: SessionSummary[]; me: Me }) {
  if (sessions.length === 0) return null;
  const id = `seances-${title}`;
  const now = Date.now();
  return (
    <section className="grid gap-2.5" aria-labelledby={id}>
      <h2 id={id} className="type-heading px-1">
        {title} · {sessions.length}
      </h2>
      <ul className="grid gap-2.5">
        {sessions.map((session) => (
          <SessionRow
            key={session.code}
            session={session}
            me={me}
            now={now}
            onRemove={(s) => void leaveSession(s.code).catch((failure: Error) => toast({ message: failure.message }))}
          />
        ))}
      </ul>
    </section>
  );
}

function Empty({ withWhom }: { withWhom: string | null }) {
  return (
    <div className="grid justify-items-center gap-4 py-10 text-center">
      <p className="type-lede">
        {withWhom ? `Pas encore de séance avec ${withWhom}.` : "Pas encore de séance."} Lancez un film, il s'affichera
        ici, en cours puis terminé.
      </p>
      <LinkButton href={CREATE_PATH} variant="filled" icon={<Plus />}>
        Créer une séance
      </LinkButton>
    </div>
  );
}
