import type { SessionSummary } from "@annamour/protocol";
import { seanceOfTitle } from "./session-rules.ts";
import { useSessions } from "./sessions.ts";

/** My séance still under way for this catalog title, if any: the way back in, rather than a second one. */
export function useSeanceOfTitle(title: { id: number; type: "movie" | "tv" }): SessionSummary | null {
  return useSessions((s) => seanceOfTitle(s.sessions, title));
}
