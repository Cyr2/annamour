import type { WatchlistItem } from "@annamour/protocol";
import { m } from "motion/react";
import { spring } from "../../lib/motion.ts";
import { PosterCard } from "../watchlist/PosterCard.tsx";

export interface PosterHandlers {
  me: string;
  onPick: (item: WatchlistItem) => void;
  onWant: (item: WatchlistItem, want: boolean) => void;
}

/** Past this many, the rest come in together: a long list never makes anyone wait. */
const STAGGERED = 9;

interface PosterGridProps extends PosterHandlers {
  items: WatchlistItem[];
  label: string;
  /** Changes when another circle or tab is shown: the posters come in again, as feedback. */
  replayKey?: string;
}

/** The titles as posters in a grid, the same cards as on « Ce soir », coming in one after the other. */
export function PosterGrid({ items, label, replayKey, ...handlers }: PosterGridProps) {
  return (
    <ul key={replayKey} className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 lg:grid-cols-5" aria-label={label}>
      {items.map((item, index) => (
        <m.li
          key={item.id}
          className="min-w-0"
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            transition: { ...spring.ui, delay: Math.min(index, STAGGERED) * 0.035 },
          }}
        >
          <PosterCard item={item} {...handlers} />
        </m.li>
      ))}
    </ul>
  );
}
