import type { SessionSummary } from "@annamour/protocol";
import { Link2, Play, RotateCcw, Trash2 } from "lucide-react";
import { m } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { exit, spring } from "../../lib/motion.ts";
import { sessionPath } from "../../sync/restart.ts";
import { BubbleStack, type StackedPerson } from "../../ui/BubbleStack.tsx";
import { Button, Menu } from "../../ui/controls.tsx";
import { cx } from "../../ui/cx.ts";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { Progress } from "../../ui/Progress.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { toast } from "../../ui/toast.ts";
import { companionsLabel, isFinished, progressOf, relativeDay, stopLabel } from "../sessions/session-rules.ts";
import { useTv } from "../tv/tv-context.ts";

interface SessionRowProps {
  session: SessionSummary;
  /** My own bubble, first in the stack. */
  me: StackedPerson;
  now: number;
  onRemove: (session: SessionSummary) => void;
}

async function copyLink(code: string) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/s/${code}`);
    toast({ message: "Lien copié", icon: <Link2 /> });
  } catch {
    toast({ message: `Le code de la séance : ${code}` });
  }
}

/**
 * What a session is: its title, code, day, who was there, how far, where it
 * stopped. Shared by the profile's rows and the TV's « Mes séances » cards.
 */
export function SessionDetails({ session, me, now }: Omit<SessionRowProps, "onRemove">) {
  const progress = progressOf(session);
  const people = useMemo(
    () => [me, ...session.participants.map((p) => ({ id: p.accountId, name: p.name, color: p.color }))],
    [me, session.participants],
  );

  return (
    <div className="grid min-w-0 gap-2">
      <strong className="truncate font-rounded-tight text-md font-extrabold text-fg">{session.title}</strong>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-fg-muted">
        <span translate="no" className="rounded-chip bg-fill-strong px-2 py-0.5 font-bold tracking-[0.12em] text-fg">
          {session.code}
        </span>
        <span>{relativeDay(session.lastUsedAt, now)}</span>
        <BubbleStack people={people} />
        <span>{companionsLabel(session)}</span>
      </div>
      {progress === null ? null : (
        <Progress.Bar value={progress} label={`${Math.round(progress * 100)} % regardé`} className="mt-1" />
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
 * back in, and the rest. A phone tucks the rest in a menu; a TV shows it as
 * buttons, since a pop-up menu is awkward with a remote.
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
      <Surface
        className={cx(
          "grid gap-3 rounded-panel p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-5 sm:p-5",
          tv && "sm:gap-8 sm:p-6",
        )}
      >
        <SessionDetails session={session} me={me} now={now} />
        <div
          // A TV's focus ring and lift reach out around a button: keep them off the next one.
          className={cx("flex items-center justify-self-end", tv ? "gap-6" : "gap-2")}
          data-tv-primary={primary ? "" : undefined}
        >
          <OpenSessionLink session={session} size={tv ? "large" : "regular"} />
          {tv ? (
            <RemoveButton session={session} onRemove={onRemove} />
          ) : (
            <SessionMenu session={session} onRemove={onRemove} />
          )}
        </div>
      </Surface>
    </m.li>
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

function SessionMenu({ session, onRemove }: SessionActionProps) {
  return (
    <Menu
      aria-label={`Plus d'options pour « ${session.title} »`}
      items={[
        { label: "Copier le lien", icon: <Link2 />, onSelect: () => void copyLink(session.code) },
        "separator",
        {
          label: "Retirer de mes séances",
          icon: <Trash2 />,
          destructive: true,
          onSelect: () => onRemove(session),
        },
      ]}
    />
  );
}

/** How long « Retirer ? » waits for the second press before standing down. */
const CONFIRM_MS = 4000;

/**
 * « Retirer » on a TV: a remote press is easy to make by mistake, so the
 * first press asks (« Vraiment retirer ? ») and only a second one removes.
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
      // As wide as « Vraiment retirer ? », so asking never reflows the row.
      className="min-w-[14rem]"
      aria-label={asking ? `Confirmer : retirer « ${session.title} »` : `Retirer « ${session.title} » de mes séances`}
      onBlur={() => setAsking(false)}
      onClick={() => (asking ? onRemove(session) : setAsking(true))}
    >
      {asking ? "Vraiment retirer ?" : "Retirer"}
    </Button>
  );
}
