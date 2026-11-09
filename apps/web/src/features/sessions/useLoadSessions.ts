import { useEffect } from "react";
import { loadSessions } from "./sessions.ts";

/** Refreshes the sessions history whenever a screen that shows it opens (a guest has none). */
export function useLoadSessions(enabled = true): void {
  useEffect(() => {
    if (enabled) void loadSessions();
  }, [enabled]);
}
