import type { SessionSummary } from "@annamour/protocol";
import { Link2, Play, RotateCcw, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { exit, spring } from "../../lib/motion.ts";
import { BubbleStack, type StackedPerson } from "../../ui/BubbleStack.tsx";
import { Glass, Menu } from "../../ui/controls.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { Progress } from "../../ui/Progress.tsx";
import { toast } from "../../ui/toast.ts";
import { companionsLabel, isFinished, progressOf, relativeDay, stopLabel } from "../sessions/session-rules.ts";

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

/** One session of « Mes séances »: what, when, with whom, how far, the way back in, and a menu for the rest. */
export function SessionRow({ session, me, now, onRemove }: SessionRowProps) {
  const finished = isFinished(session);
  const progress = progressOf(session);
  const people = useMemo(
    () => [me, ...session.participants.map((p) => ({ id: p.accountId, name: p.name, color: p.color }))],
    [me, session.participants],
  );

  return (
    <motion.li
      layout
      // The open menu is focused: lift this row so its menu floats over the next ones.
      className="relative focus-within:z-(--am-z-raised)"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: spring.ui }}
      exit={{ opacity: 0, scale: 0.96, transition: exit.quick }}
    >
      <Glass className="grid gap-3 rounded-panel p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-5 sm:p-5">
        <div className="grid min-w-0 gap-2">
          <strong className="truncate font-rounded-tight text-md font-extrabold text-fg">{session.title}</strong>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-fg-muted">
            <span
              translate="no"
              className="rounded-chip bg-fill-strong px-2 py-0.5 font-bold tracking-[0.12em] text-fg"
            >
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
        <div className="flex items-center gap-2 justify-self-end">
          <LinkButton
            href={`/s/${session.code}`}
            variant={finished ? "glass" : "filled"}
            icon={finished ? <RotateCcw /> : <Play />}
          >
            {finished ? "Revoir" : "Reprendre"}
          </LinkButton>
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
        </div>
      </Glass>
    </motion.li>
  );
}
