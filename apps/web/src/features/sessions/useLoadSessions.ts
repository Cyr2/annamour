import { useEffect } from "react";
import { loadSessions } from "./sessions.ts";

/** A séance created for a circle reaches the others' screens within this time, without anyone reloading. */
const REFRESH_MS = 30_000;

/**
 * Refreshes the sessions history whenever a screen that shows it opens, comes
 * back to the foreground, and every little while as it stays open (a guest has none).
 */
export function useLoadSessions(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    void loadSessions();
    const refresh = () => {
      if (document.visibilityState === "visible") void loadSessions();
    };
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled]);
}
