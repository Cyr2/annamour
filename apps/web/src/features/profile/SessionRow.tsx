import type { SessionSummary } from "@annamour/protocol";
import { Play, RotateCcw, Trash2 } from "lucide-react";
import { m } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { exit, spring } from "../../lib/motion.ts";
import { sessionPath } from "../../sync/restart.ts";
import { BubbleStack, type StackedPerson } from "../../ui/BubbleStack.tsx";
import { Button } from "../../ui/controls.tsx";
import { EpisodeBars } from "../../ui/EpisodeBars.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { Progress } from "../../ui/Progress.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { SeanceOptions } from "../sessions/SeanceOptions.tsx";
import { SeancePoster } from "../sessions/SeancePoster.tsx";
import {
  companionsLabel,
  isFinished,
  progressOf,
  relativeDay,
  sessionTitle,
  stopLabel,
} from "../sessions/session-rules.ts";
import { useTv } from "../tv/tv-context.ts";
import { SessionCompactDetails } from "./SessionCompactDetails.tsx";

interface SessionRowProps {
  session: SessionSummary;
  /** My own bubble, first in the stack. */
  me: StackedPerson;
  now: number;
  onRemove: (session: SessionSummary) => void;
}

/** Everyone of the séance for its bubbles, me first; who left is drawn faded. */
function useSessionPeople(session: SessionSummary, me: StackedPerson): StackedPerson[] {
  return useMemo(
    () => [
      me,
      ...session.participants.map((p) => ({ id: p.accountId, name: p.name, color: p.color, left: p.left ?? false })),
    ],
    [me, session.participants],
  );
}

/**
 * What a session is, read from the sofa: its title, code (a remote has no
 * « ⋯ » to show it), day, who was there, how far, where it stopped. The TV's
 * rows and home shelf; a phone shows the shorter SessionCompactDetails.
 */
export function SessionDetails({ session, me, now }: Omit<SessionRowProps, "onRemove">) {
  const progress = progressOf(session);
  const people = useSessionPeople(session, me);

  return (
    <div className="grid min-w-0 gap-2">
      <strong className="truncate font-rounded-tight text-md font-extrabold text-fg">{sessionTitle(session)}</strong>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-fg-muted">
        <span translate="no" className="rounded-chip bg-fill-strong px-2 py-0.5 font-bold tracking-[0.12em] text-fg">
          {session.code}
        </span>
        <span>{relativeDay(session.lastUsedAt, now)}</span>
        <BubbleStack people={people} />
        <span>{companionsLabel(session)}</span>
      </div>
      {session.episode.count > 1 ? (
        <EpisodeBars
          count={session.episode.count}
          current={session.episode.index}
          progress={progress}
          finished={isFinished(session)}
          className="mt-1"
        />
      ) : progress === null ? null : (
        <Progress.Bar
          value={progress}
          label={`${Math.round(progress * 100)} % regardé`}
          done={isFinished(session)}
          className="mt-1"
        />
      )}
      <p className="text-xs text-fg-muted">{stopLabel(session)}</p>
    </div>
  );
}

interface SessionRowItemProps extends SessionRowProps {
  /** The TV starts on the first row's way back in (see features/tv/focus-engine.ts). */
  primary?: boolean;
}

/**
 * One session of « Mes séances »: what, when, with whom, how far, the way
 * back in, and the rest. A phone tucks the rest behind « ⋯ » (leave, delete);
 * a TV shows « Quitter » as a button, since a sheet is awkward with a remote.
 */
export function SessionRow({ session, me, now, onRemove, primary = false }: SessionRowItemProps) {
  const tv = useTv();

  return (
    <m.li
      layout
      // The open menu is focused: lift this row so its menu floats over the next ones.
      className="relative focus-within:z-(--am-z-raised)"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: spring.ui }}
      exit={{ opacity: 0, scale: 0.96, transition: exit.quick }}
    >
      {tv ? (
        // A TV's rows stay text, read from the sofa.
        <Surface className="grid gap-3 rounded-panel p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8 sm:p-6">
          <SessionDetails session={session} me={me} now={now} />
          <div
            // A TV's focus ring and lift reach out around a button: keep them off the next one.
            className="flex items-center gap-6 justify-self-end"
            data-tv-primary={primary ? "" : undefined}
          >
            <OpenSessionLink session={session} size="large" />
            <RemoveButton session={session} onRemove={onRemove} />
          </div>
        </Surface>
      ) : (
        <CompactCard session={session} me={me} now={now} />
      )}
    </m.li>
  );
}

/**
 * A phone's card, short like a list in an Apple app: the poster, then the
 * title, when and with whom, how far; the way back in and « ⋯ » underneath,
 * or beside it all once the screen is wide enough.
 */
function CompactCard({ session, me, now }: Omit<SessionRowProps, "onRemove">) {
  const people = useSessionPeople(session, me);
  return (
    <Surface className="flex gap-3 rounded-panel p-3 sm:gap-4 sm:p-4">
      <SeancePoster session={session} className="w-16 shrink-0 self-start" />
      <div className="grid min-w-0 flex-1 gap-2.5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-5">
        <SessionCompactDetails session={session} people={people} now={now} />
        <div className="flex items-center gap-2 justify-self-end">
          <OpenSessionLink session={session} size="regular" />
          <SeanceOptions session={session} />
        </div>
      </div>
    </Surface>
  );
}

/** « Reprendre » where the séance stopped, or « Revoir » from the beginning once it was watched to the end. */
function OpenSessionLink({ session, size }: { session: SessionSummary; size: "regular" | "large" }) {
  const finished = isFinished(session);
  return (
    <LinkButton
      href={sessionPath(session.code, finished)}
      variant={finished ? "glass" : "filled"}
      size={size}
      icon={finished ? <RotateCcw /> : <Play />}
    >
      {finished ? "Revoir" : "Reprendre"}
    </LinkButton>
  );
}

type SessionActionProps = Pick<SessionRowProps, "session" | "onRemove">;

/** How long « Quitter ? » waits for the second press before standing down. */
const CONFIRM_MS = 4000;

/**
 * « Quitter » on a TV: a remote press is easy to make by mistake, so the
 * first press asks (« Vraiment quitter ? ») and only a second one leaves.
 * Moving the focus away, or waiting, stands it down.
 */
function RemoveButton({ session, onRemove }: SessionActionProps) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const timer = setTimeout(() => setAsking(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [asking]);

  return (
    <Button
      size="large"
      tone={asking ? "destructive" : "default"}
      icon={<Trash2 />}
      // As wide as « Vraiment quitter ? », so asking never reflows the row.
      className="min-w-[14rem]"
      aria-label={asking ? `Confirmer : quitter « ${session.title} »` : `Quitter « ${session.title} »`}
      onBlur={() => setAsking(false)}
      onClick={() => (asking ? onRemove(session) : setAsking(true))}
    >
      {asking ? "Vraiment quitter ?" : "Quitter"}
    </Button>
  );
}
