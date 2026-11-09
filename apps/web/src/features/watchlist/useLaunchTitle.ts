import type { PlayCatalogRequest, WatchlistItem } from "@annamour/protocol";
import { useState } from "react";
import { useLocation } from "wouter";
import { playCatalog } from "../../api/catalog.ts";
import { errorMessage } from "../../api/http.ts";
import { circleForNewSeance } from "../circles/circles.ts";

/**
 * « Lancer une séance » from the list: creates the séance and opens its salon.
 * A film becomes « vu » once a séance reaches its end (the server sees it), not here.
 */
export function useLaunchTitle() {
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launch = async (item: WatchlistItem, episode?: { season: number; episode: number }) => {
    const { id, type, title, posterUrl } = item.title;
    // The poster goes along, so the séance can show it on « Ce soir ».
    const base = { id, type, title, ...(posterUrl ? { posterUrl } : {}) };
    const play: PlayCatalogRequest = episode ? { ...base, ...episode } : base;
    setBusy(true);
    setError(null);
    try {
      const code = await playCatalog(play, item.circleId ?? circleForNewSeance());
      navigate(`/s/${code}`);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return { launch, busy, error };
}
