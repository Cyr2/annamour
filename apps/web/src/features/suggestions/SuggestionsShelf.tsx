import { type Circle, type Suggestion, suggestForCircle, type WatchlistItem } from "@annamour/protocol";
import { useEffect, useMemo, useState } from "react";
import { Poster } from "../../ui/Poster.tsx";
import { useAccount } from "../account/account.ts";
import { loadRatings, useRatings } from "../ratings/ratings.ts";
import { useSessions } from "../sessions/sessions.ts";
import { useWatchlist } from "../watchlist/watchlist.ts";
import { SuggestionSheet } from "./SuggestionSheet.tsx";
import { circleTaste, reasonLine } from "./suggestion-rules.ts";

interface SuggestionsShelfProps {
  circle: Circle | null;
  /** A suggestion from the circle's list opens that title's sheet. */
  onOpenItem: (item: WatchlistItem) => void;
}

/**
 * « Idées pour ce soir »: what the circle shown could watch together, each
 * with why (« Annou a adoré », « Toi et Annou en avez envie »). Nothing without
 * a circle, nor when its people said nothing yet.
 */
export function SuggestionsShelf({ circle, onOpenItem }: SuggestionsShelfProps) {
  const me = useAccount((s) => s.account?.id ?? "");
  const items = useWatchlist((s) => s.items);
  const ratings = useRatings((s) => s.ratings);
  const sessions = useSessions((s) => s.sessions);
  const [open, setOpen] = useState<Suggestion | null>(null);
  useEffect(() => {
    void loadRatings();
  }, []);
  const suggestions = useMemo(
    () => (circle ? suggestForCircle(circleTaste(circle, items, ratings, sessions)) : []),
    [circle, items, ratings, sessions],
  );
  if (!circle || suggestions.length === 0) return null;

  const pick = (suggestion: Suggestion) => {
    const item = items.find((candidate) => candidate.id === suggestion.itemId);
    if (item) onOpenItem(item);
    else setOpen(suggestion);
  };

  return (
    <section className="grid w-full gap-1 text-left" aria-labelledby="suggestions-title">
      <h2 id="suggestions-title" className="type-heading px-1">
        Idées pour ce soir
      </h2>
      <ul className="flex gap-3 overflow-x-auto py-3 [scrollbar-width:none]">
        {suggestions.map((suggestion) => {
          const why = suggestion.reasons[0] ? reasonLine(suggestion.reasons[0], me) : "";
          return (
            <li key={`${suggestion.title.type}:${suggestion.title.id}`} className="w-[7.5rem] shrink-0">
              <button
                type="button"
                onClick={() => pick(suggestion)}
                aria-label={`${suggestion.title.title} : ${why}`}
                className="am-press grid w-full cursor-pointer gap-2 rounded-control text-left"
              >
                <Poster title={suggestion.title} size="card" />
                <span className="grid gap-0.5 px-0.5">
                  <span className="truncate text-sm font-semibold text-fg">{suggestion.title.title}</span>
                  <span className="line-clamp-2 text-xs text-fg-muted">{why}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <SuggestionSheet suggestion={open} circle={circle} me={me} onClose={() => setOpen(null)} />
    </section>
  );
}
