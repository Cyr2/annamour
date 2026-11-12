import type { GroupSuggestion } from "@annamour/protocol";
import { useEffect, useState } from "react";
import { fetchSuggestions } from "../../api/suggestions.ts";
import { useRatings } from "../ratings/ratings.ts";
import { useWatchlist } from "../watchlist/watchlist.ts";

/**
 * The circle's suggestions from the server; asked again when an avis or a wish
 * changes (the server keeps them meanwhile). Null while loading, empty when there
 * are none or they cannot be read: the shelf then stays out of the way.
 */
export function useSuggestions(circleId: string | null): {
  suggestions: GroupSuggestion[] | null;
  refresh: () => void;
} {
  const [suggestions, setSuggestions] = useState<GroupSuggestion[] | null>(null);
  const [asked, setAsked] = useState(0);
  // What the suggestions are made of: the avis and the wishes, in a word that changes with them.
  const ratingsVersion = useRatings((s) => s.ratings.map((r) => `${r.by.accountId}${r.rating}${r.title.id}`).join());
  const wishesVersion = useWatchlist((s) =>
    s.items.map((i) => `${i.id}${i.wantedBy.length}${i.watchedAt ?? ""}`).join(),
  );

  // Another circle: its placeholder, not the previous circle's suggestions, until its own arrive.
  useEffect(() => {
    void circleId;
    setSuggestions(null);
  }, [circleId]);

  useEffect(() => {
    if (!circleId) return setSuggestions([]);
    // Read so the effect runs again when they change.
    void ratingsVersion;
    void wishesVersion;
    void asked;
    const controller = new AbortController();
    const settle = (found: GroupSuggestion[]) => {
      if (!controller.signal.aborted) setSuggestions(found);
    };
    fetchSuggestions(circleId, controller.signal).then(settle, () => settle([]));
    return () => controller.abort();
  }, [circleId, ratingsVersion, wishesVersion, asked]);

  return { suggestions, refresh: () => setAsked((count) => count + 1) };
}
