import type { CatalogLanguage, PlayCatalogRequest, WatchlistItem } from "@annamour/protocol";
import { useState } from "react";
import { useLocation } from "wouter";
import { playCatalog } from "../../api/catalog.ts";
import { errorMessage } from "../../api/http.ts";
import { circleForTitle } from "../circles/circles.ts";
import { episodeRequest, filmRequest } from "../home/create/catalog-rules.ts";

/**
 * « Lancer une séance » from the list: creates the séance and opens its salon.
 * A film becomes « vu » once a séance reaches its end (the server sees it), not here.
 */
export function useLaunchTitle() {
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** A title of the list, or any title for a circle (a suggestion). */
  const launch = async (
    item: Pick<WatchlistItem, "title" | "circleId">,
    episode?: { season: number; episode: number; language?: CatalogLanguage | undefined },
  ) => {
    // A film plays like one picked in the search (an anime in VF when it has it); a series at the episode given.
    const film = filmRequest(item.title);
    const play: PlayCatalogRequest = episode ? episodeRequest(item.title, episode) : film;
    setBusy(true);
    setError(null);
    try {
      const code = await playCatalog(play, circleForTitle(item));
      navigate(`/s/${code}`);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return { launch, busy, error };
}
