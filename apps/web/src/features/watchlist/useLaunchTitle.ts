import type { PlayCatalogRequest, WatchlistItem } from "@annamour/protocol";
import { useState } from "react";
import { useLocation } from "wouter";
import { playCatalog } from "../../api/catalog.ts";
import { errorMessage } from "../../api/http.ts";
import { circleForNewSeance } from "../circles/circles.ts";
import { markWatched } from "./watchlist.ts";

/**
 * « Lancer une séance » from the list: creates the séance and opens its salon.
 * A film then counts as watched; a series stays in the list for its next episodes.
 */
export function useLaunchTitle() {
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launch = async (item: WatchlistItem, episode?: { season: number; episode: number }) => {
    const { id, type, title } = item.title;
    const play: PlayCatalogRequest = episode ? { id, type, title, ...episode } : { id, type, title };
    setBusy(true);
    setError(null);
    try {
      const code = await playCatalog(play, item.circleId ?? circleForNewSeance());
      if (type === "movie") void markWatched(item.id, true).catch(() => {});
      navigate(`/s/${code}`);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return { launch, busy, error };
}
