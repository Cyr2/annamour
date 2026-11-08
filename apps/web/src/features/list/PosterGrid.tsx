import type { WatchlistItem } from "@annamour/protocol";
import { PosterCard } from "../watchlist/PosterCard.tsx";

export interface PosterHandlers {
  me: string;
  onPick: (item: WatchlistItem) => void;
  onWant: (item: WatchlistItem, want: boolean) => void;
}

/** The titles as posters in a grid, the same cards as on « Ce soir ». */
export function PosterGrid({ items, label, ...handlers }: { items: WatchlistItem[]; label: string } & PosterHandlers) {
  return (
    <ul className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 lg:grid-cols-5" aria-label={label}>
      {items.map((item) => (
        <li key={item.id} className="min-w-0">
          <PosterCard item={item} {...handlers} />
        </li>
      ))}
    </ul>
  );
}
