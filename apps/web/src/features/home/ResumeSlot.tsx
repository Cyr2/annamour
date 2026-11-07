import { ChevronRight, Play } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { spring } from "../../lib/motion.ts";
import { GlassLink } from "../../ui/GlassLink.tsx";
import { Progress } from "../../ui/Progress.tsx";
import { latestUnfinished, progressOf, resumeLine } from "../sessions/session-rules.ts";
import { useSessions } from "../sessions/sessions.ts";
import { useLoadSessions } from "../sessions/useLoadSessions.ts";

/** « Reprendre »: the last unfinished session, reopened for everyone at its saved position. Hidden when there is none. */
export function ResumeSlot() {
  useLoadSessions();
  const sessions = useSessions((s) => s.sessions);
  const session = useMemo(() => latestUnfinished(sessions), [sessions]);
  if (!session) return null;

  const progress = progressOf(session) ?? 0;
  return (
    <motion.div
      className="mt-6 w-[min(460px,100%)]"
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring.ui, delay: 0.15 }}
    >
      <GlassLink
        href={`/s/${session.code}`}
        material="frost"
        className="surface-panel"
        linkClassName="group flex min-h-11 items-center gap-4 p-3.5 pr-4 text-left"
      >
        <Progress.Ring value={progress} label={`${Math.round(progress * 100)} % regardé`}>
          <Play aria-hidden className="relative ml-0.5 size-5 fill-current text-fg" />
        </Progress.Ring>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-xs font-semibold text-accent">Reprendre</span>
          <strong className="truncate font-rounded-tight text-md font-extrabold text-fg">{session.title}</strong>
          <span className="text-sm text-pretty text-fg-muted">{resumeLine(session, Date.now())}</span>
        </span>
        <ChevronRight
          aria-hidden
          className="size-5 shrink-0 text-fg-subtle transition-transform duration-200 ease-out group-hover:translate-x-0.5"
        />
      </GlassLink>
    </motion.div>
  );
}
