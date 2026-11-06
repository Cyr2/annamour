import type { SessionSummary } from "@annamour/protocol";
import { RefreshCw } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { type ReactNode, useMemo } from "react";
import { plural } from "../../lib/format.ts";
import type { StackedPerson } from "../../ui/BubbleStack.tsx";
import { Button } from "../../ui/controls.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { splitByStatus } from "../sessions/session-rules.ts";
import { loadSessions, type SessionsStatus } from "../sessions/sessions.ts";
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

  return (
    <section className="grid gap-3" aria-labelledby="history-title" aria-busy={status === "loading"}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="history-title" className="font-rounded-tight text-lg font-extrabold text-fg">
          {personName ? `Avec ${personName}` : "Mes séances"}
        </h2>
        {status === "ready" ? <span className="text-xs text-fg-muted">{plural(sessions.length, "séance")}</span> : null}
      </div>
      <HistoryBody status={status} error={error} empty={sessions.length === 0}>
        <Group title="En cours" sessions={ongoing} me={me} now={now} onRemove={onRemove} />
        <Group title="Terminées" sessions={finished} me={me} now={now} onRemove={onRemove} />
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
      <div className="grid justify-items-start gap-3 rounded-panel border border-dashed border-line-strong p-5">
        <p className="text-sm text-fg-muted">
          Tes séances apparaîtront ici, chez toi comme chez celles et ceux qui les regardent avec toi. Crée-en une ou
          rejoins quelqu'un avec son code.
        </p>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/" variant="filled">
            Créer une séance
          </LinkButton>
          <LinkButton href="/rejoindre">Rejoindre</LinkButton>
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
  onRemove: (session: SessionSummary) => void;
}

function Group({ title, sessions, me, now, onRemove }: GroupProps) {
  if (sessions.length === 0) return null;
  return (
    <div className="grid gap-2.5">
      <h3 className="mt-2 text-xs font-semibold tracking-[0.08em] text-fg-subtle uppercase">{title}</h3>
      <ul className="grid gap-2.5">
        <AnimatePresence initial={false}>
          {sessions.map((session) => (
            <SessionRow key={session.code} session={session} me={me} now={now} onRemove={onRemove} />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
