import type { Circle, GroupSuggestion, WatchlistItem } from "@annamour/protocol";
import { useEffect, useId, useState } from "react";
import { Poster } from "../../ui/Poster.tsx";
import { useAccount } from "../account/account.ts";
import { loadRatings } from "../ratings/ratings.ts";
import { ShelfPlaceholder } from "../watchlist/ShelfPlaceholder.tsx";
import { useWatchlist } from "../watchlist/watchlist.ts";
import { SuggestionSheet } from "./SuggestionSheet.tsx";
import { matchLine, reasonLine } from "./suggestion-rules.ts";
import { useSuggestions } from "./useSuggestions.ts";

const TITLE = "Pour vous ce soir";

interface SuggestionsShelfProps {
  circle: Circle | null;
  /** A suggestion from the circle's list opens that title's sheet. */
  onOpenItem: (item: WatchlistItem) => void;
}

/**
 * « Pour vous ce soir »: what the circle shown could watch together, from each
 * one's tastes, with how well it suits each (« Toi 92 % · Anna 85 % ») and why.
 * Nothing without a circle, nor when there is nothing to suggest yet.
 */
export function SuggestionsShelf({ circle, onOpenItem }: SuggestionsShelfProps) {
  const me = useAccount((s) => s.account?.id ?? "");
  const items = useWatchlist((s) => s.items);
  const suggestions = useSuggestions(circle?.id ?? null);
  const [open, setOpen] = useState<GroupSuggestion | null>(null);
  const headingId = useId();
  useEffect(() => {
    void loadRatings();
  }, []);
  if (!circle) return null;
  // Its room is kept while the suggestions are on their way.
  if (suggestions === null) return <ShelfPlaceholder title={TITLE} />;
  if (suggestions.length === 0) return null;

  const pick = (suggestion: GroupSuggestion) => {
    const item = items.find((candidate) => candidate.id === suggestion.itemId);
    if (item) onOpenItem(item);
    else setOpen(suggestion);
  };

  return (
    <section className="grid w-full gap-1 text-left" aria-labelledby={headingId}>
      <h2 id={headingId} className="type-heading px-1">
        {TITLE}
      </h2>
      <ul className="flex gap-3 overflow-x-auto py-3 [scrollbar-width:none]">
        {suggestions.map((suggestion) => {
          const why = suggestion.reasons[0] ? reasonLine(suggestion.reasons[0], me) : "";
          const match = matchLine(suggestion, me);
          return (
            <li key={`${suggestion.title.type}:${suggestion.title.id}`} className="w-[7.5rem] shrink-0">
              <button
                type="button"
                onClick={() => pick(suggestion)}
                aria-label={[suggestion.title.title, match, why].filter(Boolean).join(", ")}
                className="am-press grid w-full cursor-pointer gap-2 rounded-control text-left"
              >
                <Poster title={suggestion.title} size="card" />
                <span className="grid gap-0.5 px-0.5">
                  <span className="truncate text-sm font-semibold text-fg">{suggestion.title.title}</span>
                  {match ? <span className="truncate text-xs font-semibold text-accent">{match}</span> : null}
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
