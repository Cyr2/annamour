import { useEffect, useRef } from "react";
import { keepShownOrder } from "./watchlist-rules.ts";

/**
 * `fresh` in the order first shown, until `view` changes (another circle,
 * another tab). Opening the screen again sorts afresh: it mounts anew.
 */
export function useShownOrder<T extends { id: string }>(fresh: readonly T[], view: string): T[] {
  const shown = useRef<{ view: string; ids: readonly string[] } | null>(null);
  const ordered = keepShownOrder(shown.current?.view === view ? shown.current.ids : [], fresh);
  // Remembered once on screen, so the next render keeps what the person saw.
  useEffect(() => {
    shown.current = { view, ids: ordered.map((item) => item.id) };
  });
  return ordered;
}
