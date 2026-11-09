import type { WatchlistItem } from "@annamour/protocol";
import { Heart } from "lucide-react";
import { m } from "motion/react";
import { spring } from "../../lib/motion.ts";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { cx } from "../../ui/cx.ts";
import { Poster } from "../../ui/Poster.tsx";
import { describeTitle } from "../home/create/CatalogResults.tsx";

interface PosterCardProps {
  item: WatchlistItem;
  me: string;
  onPick: (item: WatchlistItem) => void;
  /** Absent on a TV: the remote opens the title, wishes are given from a phone. */
  onWant?: (item: WatchlistItem, want: boolean) => void;
  /** Read out after the title, e.g. « OK pour lancer » on a TV. */
  hint?: string;
}

/**
 * A title as a poster, the same everywhere: who proposed it at the bottom,
 * the heart at the top (full: I want to watch it; the number: how many do).
 */
export function PosterCard({ item, me, onPick, onWant, hint }: PosterCardProps) {
  const wanted = item.wantedBy.includes(me);
  const count = item.wantedBy.length;
  const author = { id: item.addedBy.accountId, name: item.addedBy.name, color: item.addedBy.color };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onPick(item)}
        aria-label={`${item.title.title}, ${describeTitle(item.title)}${hint ? ` : ${hint}` : ""}`}
        className="grid w-full cursor-pointer gap-2 rounded-control text-left"
      >
        <span className="relative block">
          <Poster title={item.title} size="card" />
          <BubbleStack people={[author]} className="absolute bottom-2 left-2" />
        </span>
        <span className="grid gap-0.5 px-0.5">
          <span className="truncate text-sm font-semibold text-fg">{item.title.title}</span>
          <span className="truncate text-xs text-fg-muted">{describeTitle(item.title)}</span>
        </span>
      </button>
      {onWant ? (
        <button
          type="button"
          aria-pressed={wanted}
          aria-label={`J'ai envie de voir ${item.title.title}${count ? `, ${count} en ${count > 1 ? "ont" : "a"} envie` : ""}`}
          onClick={() => onWant(item, !wanted)}
          // 44px to the finger; the visible chip stays small on the poster.
          className="absolute top-0 right-0 grid size-11 cursor-pointer place-items-center"
        >
          <span className="flex h-7 items-center gap-1 rounded-pill bg-scrim px-2 text-xs font-bold text-fg">
            {/* Keyed on the wish: the heart springs in again each time it is given or taken back. */}
            <m.span
              key={wanted ? "wanted" : "not"}
              className="grid"
              initial={{ scale: wanted ? 0.4 : 0.8 }}
              animate={{ scale: 1, transition: spring.bubble }}
            >
              <Heart aria-hidden className={cx("size-3.5", wanted && "fill-accent text-accent")} />
            </m.span>
            {count > 0 ? count : null}
          </span>
        </button>
      ) : null}
    </div>
  );
}
