import { useEffect } from "react";
import { loadWatchlist } from "./watchlist.ts";

/** Refreshes the shared watchlist whenever a screen that shows it opens. */
export function useLoadWatchlist(): void {
  useEffect(() => {
    void loadWatchlist();
  }, []);
}
