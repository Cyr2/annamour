import { Play } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { Link } from "wouter";
import { spring } from "../../lib/motion.ts";
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
      className="mt-4 w-[min(460px,100%)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.ui}
    >
      <Link
        href={`/s/${session.code}`}
        className="lg-glass flex min-h-11 items-center gap-4 rounded-panel p-3.5 pr-5 text-left no-underline transition-transform duration-300 active:scale-[0.98]"
      >
        <Progress.Ring value={progress} label={`${Math.round(progress * 100)} % regardé`}>
          <Play aria-hidden className="relative size-5 fill-current text-fg" />
        </Progress.Ring>
        <span className="grid min-w-0 gap-0.5">
          <small className="text-xs font-semibold text-thread">Reprendre</small>
          <strong className="truncate font-rounded-tight text-md font-extrabold text-fg">{session.title}</strong>
          <span className="truncate text-sm text-fg-muted">{resumeLine(session, Date.now())}</span>
        </span>
      </Link>
    </motion.div>
  );
}
