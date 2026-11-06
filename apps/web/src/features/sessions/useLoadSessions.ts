import { useEffect } from "react";
import { loadSessions } from "./sessions.ts";

/** Refreshes the sessions history whenever a screen that shows it opens. */
export function useLoadSessions(): void {
  useEffect(() => {
    void loadSessions();
  }, []);
}
