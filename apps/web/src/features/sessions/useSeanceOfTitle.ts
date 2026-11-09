import type { SessionSummary } from "@annamour/protocol";
import { useMemo } from "react";
import { useAccount } from "../account/account.ts";
import { seanceToResume } from "../circles/circle-rules.ts";
import { shownCircle, useCircles } from "../circles/circles.ts";
import { useSessions } from "./sessions.ts";

/**
 * My séance still under way for this catalog title in the circle a new one
 * would go to (the title's own, else the one on screen): the way back in,
 * rather than a second one.
 */
export function useSeanceOfTitle(
  title: { id: number; type: "movie" | "tv" },
  circleId?: string,
): SessionSummary | null {
  const me = useAccount((s) => s.account?.id ?? "");
  const shown = useCircles((s) => shownCircle(s));
  const circles = useCircles((s) => s.circles);
  const sessions = useSessions((s) => s.sessions);
  const target = circleId ?? shown;
  const { id, type } = title;
  return useMemo(
    () => seanceToResume({ id, type }, { sessions, circleId: target, circles, me }),
    [id, type, sessions, target, circles, me],
  );
}
