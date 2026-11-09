import type { SessionSummary } from "@annamour/protocol";
import { BubbleStack, type StackedPerson } from "../../ui/BubbleStack.tsx";
import { EpisodeBars } from "../../ui/EpisodeBars.tsx";
import { Progress } from "../../ui/Progress.tsx";
import { isFinished, progressNote, progressOf, sessionTitle, whenAndWhoLabel } from "../sessions/session-rules.ts";

interface SessionCompactDetailsProps {
  session: SessionSummary;
  /** Everyone of the séance, me first. */
  people: readonly StackedPerson[];
  now: number;
}

/**
 * A séance in three short lines, for a phone's card: its title, when and with
 * whom, then how far with what is left beside the bar. The code waits behind « ⋯ ».
 */
export function SessionCompactDetails({ session, people, now }: SessionCompactDetailsProps) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <strong className="truncate font-rounded-tight text-md font-extrabold text-fg">{sessionTitle(session)}</strong>
      <div className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
        <BubbleStack people={people} className="shrink-0" />
        <span className="truncate">{whenAndWhoLabel(session, now)}</span>
      </div>
      <div className="mt-1 flex items-center gap-2.5">
        <SessionProgress session={session} />
        <span className="shrink-0 text-xs text-fg-muted tabular-nums">{progressNote(session)}</span>
      </div>
    </div>
  );
}

/** The episodes' bars for a series, one bar otherwise; nothing to draw without a length. */
function SessionProgress({ session }: { session: SessionSummary }) {
  const progress = progressOf(session);
  const finished = isFinished(session);
  if (session.episode.count > 1) {
    return (
      <EpisodeBars
        count={session.episode.count}
        current={session.episode.index}
        progress={progress}
        finished={finished}
        className="min-w-0 flex-1"
      />
    );
  }
  if (progress === null) return null;
  return (
    <Progress.Bar
      value={progress}
      label={`${Math.round(progress * 100)} % regardé`}
      done={finished}
      className="min-w-0 flex-1"
    />
  );
}
