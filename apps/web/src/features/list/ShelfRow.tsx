import { type Circle, circleTitle, othersIn, type WatchlistItem } from "@annamour/protocol";
import { ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { PosterCard } from "../watchlist/PosterCard.tsx";

export interface ShelfHandlers {
  me: string;
  onPick: (item: WatchlistItem) => void;
  onWant: (item: WatchlistItem, want: boolean) => void;
}

/** Who a shelf is with: the circle's bubbles and name, or everyone for titles that fit no circle. */
export function shelfName(circle: Circle | null, me: string): string {
  return circle ? circleTitle(circle, me) : "Avec tout le monde";
}

/** One floor of « Notre liste »: who it is with, « Tout voir », then its posters side by side. */
export function ShelfRow({
  circle,
  items,
  ...handlers
}: { circle: Circle | null; items: WatchlistItem[] } & ShelfHandlers) {
  const name = shelfName(circle, handlers.me);
  const people = circle
    ? othersIn(circle, handlers.me).map((p) => ({ id: p.accountId, name: p.name, color: p.color }))
    : [];
  const headingId = `shelf-${circle?.id ?? "all"}`;

  return (
    <section className="grid gap-1" aria-labelledby={headingId}>
      <div className="flex items-center gap-2.5 px-1">
        {people.length ? <BubbleStack people={people} /> : null}
        <h2 id={headingId} className="min-w-0 flex-1 truncate font-rounded-tight text-md font-extrabold text-fg">
          {name}
        </h2>
        <Link
          href={`/liste?cercle=${circle?.id ?? "tous"}`}
          className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-accent"
        >
          Tout voir · {items.length}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
      <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 py-2 [scrollbar-width:none]">
        {items.map((item) => (
          <li key={item.id} className="w-[7.5rem] shrink-0">
            <PosterCard item={item} {...handlers} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The same posters in a grid: a single shelf, one circle's « Tout voir », or what was watched. */
export function PosterGrid({ items, label, ...handlers }: { items: WatchlistItem[]; label: string } & ShelfHandlers) {
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
