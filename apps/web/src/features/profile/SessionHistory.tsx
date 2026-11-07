import type { SessionSummary } from "@annamour/protocol";
import { RefreshCw } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { type ReactNode, useMemo } from "react";
import { plural } from "../../lib/format.ts";
import type { StackedPerson } from "../../ui/BubbleStack.tsx";
import { Button } from "../../ui/controls.tsx";
import { LayoutMotion } from "../../ui/LayoutMotion.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { CREATE_PATH } from "../home/create/create-link.ts";
import { splitByStatus } from "../sessions/session-rules.ts";
import { loadSessions, type SessionsStatus } from "../sessions/sessions.ts";
import { useTv } from "../tv/tv-context.ts";
import { SessionRow } from "./SessionRow.tsx";

interface SessionHistoryProps {
  status: SessionsStatus;
  error: string | null;
  /** Already filtered by person. */
  sessions: readonly SessionSummary[];
  /** The person the list is filtered on, for the heading. */
  personName: string | null;
  me: StackedPerson;
  onRemove: (session: SessionSummary) => void;
}

/** « Mes séances »: the ones still going, then the ones watched to the end. */
export function SessionHistory({ status, error, sessions, personName, me, onRemove }: SessionHistoryProps) {
  const { ongoing, finished } = useMemo(() => splitByStatus(sessions), [sessions]);
  const now = Date.now();
  // Where a remote starts: the first séance's way back in.
  const firstCode = (ongoing[0] ?? finished[0])?.code ?? null;

  return (
    <section className="grid gap-3" aria-labelledby="history-title" aria-busy={status === "loading"}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="history-title" className="type-heading">
          {personName ? `Avec ${personName}` : "Mes séances"}
        </h2>
        {status === "ready" ? <span className="text-xs text-fg-muted">{plural(sessions.length, "séance")}</span> : null}
      </div>
      <HistoryBody status={status} error={error} empty={sessions.length === 0}>
        {/* Removing a séance slides the next ones up into its place. */}
        <LayoutMotion>
          <Group title="En cours" sessions={ongoing} me={me} now={now} firstCode={firstCode} onRemove={onRemove} />
          <Group title="Terminées" sessions={finished} me={me} now={now} firstCode={firstCode} onRemove={onRemove} />
        </LayoutMotion>
      </HistoryBody>
    </section>
  );
}

function HistoryBody({
  status,
  error,
  empty,
  children,
}: {
  status: SessionsStatus;
  error: string | null;
  empty: boolean;
  children: ReactNode;
}) {
  const tv = useTv();
  if (status === "idle" || status === "loading") {
    return (
      <div className="grid place-items-center py-10">
        <ThreadSpinner />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="grid justify-items-start gap-3 py-4">
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
        <Button icon={<RefreshCw />} onClick={() => void loadSessions()}>
          Réessayer
        </Button>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="grid justify-items-start gap-4 rounded-panel border border-dashed border-line-strong p-5 sm:p-6">
        <p className="text-sm text-fg-muted">
          Tes séances apparaîtront ici, chez toi comme chez celles et ceux qui les regardent avec toi.{" "}
          {tv
            ? "Crée-en une depuis ton téléphone, ou rejoins quelqu'un avec son code."
            : "Crée-en une ou rejoins quelqu'un avec son code."}
        </p>
        <div className="flex flex-wrap gap-2">
          {/* Pasting a link with a remote is no fun: a TV only joins. */}
          {tv ? null : (
            <LinkButton href={CREATE_PATH} variant="filled">
              Créer une séance
            </LinkButton>
          )}
          <LinkButton href="/rejoindre" variant={tv ? "filled" : "glass"}>
            Rejoindre
          </LinkButton>
        </div>
      </div>
    );
  }
  return children;
}

interface GroupProps {
  title: string;
  sessions: readonly SessionSummary[];
  me: StackedPerson;
  now: number;
  firstCode: string | null;
  onRemove: (session: SessionSummary) => void;
}

function Group({ title, sessions, me, now, firstCode, onRemove }: GroupProps) {
  if (sessions.length === 0) return null;
  return (
    <div className="grid gap-2.5">
      <h3 className="type-label mt-3 px-1">{title}</h3>
      <ul className="grid gap-2.5">
        <AnimatePresence initial={false}>
          {sessions.map((session) => (
            <SessionRow
              key={session.code}
              session={session}
              me={me}
              now={now}
              onRemove={onRemove}
              primary={session.code === firstCode}
            />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
