import { type Circle, sortWatchlist, splitWatchlist, type WatchlistItem } from "@annamour/protocol";
import { ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { plural } from "../../lib/format.ts";
import { BubbleStack } from "../../ui/BubbleStack.tsx";
import { cx } from "../../ui/cx.ts";
import { Poster } from "../../ui/Poster.tsx";
import { useAccount } from "../account/account.ts";
import { ofCircle } from "../circles/circle-rules.ts";
import { describeTitle } from "../home/create/CatalogResults.tsx";
import { useTv } from "../tv/tv-context.ts";
import { listPath, useCircleUi } from "../ui-version/ui-version.ts";
import { useLaunchTitle } from "./useLaunchTitle.ts";
import { useLoadWatchlist } from "./useLoadWatchlist.ts";
import { WatchlistItemSheet } from "./WatchlistItemSheet.tsx";
import { useWatchlist } from "./watchlist.ts";

const SHELF_SIZE = 10;

/**
 * « À regarder ensemble » under the home screen: the most wanted titles still
 * to watch. On a TV, OK on a film starts it at once (a series asks for its
 * episode first); adding stays on the phone.
 */
export function WatchlistShelf({
  circle = null,
  title = "À regarder ensemble",
}: {
  /** Only this circle's titles (null: all of them). */
  circle?: Circle | null;
  title?: string;
}) {
  useLoadWatchlist();
  const tv = useTv();
  const circleUi = useCircleUi();
  const me = useAccount((s) => s.account?.id ?? "");
  const items = useWatchlist((s) => s.items);
  const toWatch = useMemo(
    () => splitWatchlist(sortWatchlist(ofCircle(items, circle, me), "wants")).toWatch,
    [items, circle, me],
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const { launch } = useLaunchTitle();
  if (toWatch.length === 0) return null;

  const pick = (item: WatchlistItem) => (tv && item.title.type === "movie" ? void launch(item) : setOpenId(item.id));

  return (
    <section className="grid w-full gap-1 text-left" aria-labelledby="shelf-title">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="shelf-title" className="type-heading">
          {title}
        </h2>
        {tv ? (
          <span className="text-xs text-fg-muted">
            {plural(toWatch.length, "titre")} · ajoute-en depuis ton téléphone
          </span>
        ) : (
          <Link
            href={listPath(circleUi)}
            className="flex min-h-11 items-center gap-1 text-sm font-semibold text-accent"
          >
            Tout voir · {toWatch.length}
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        )}
      </div>
      {/* Room around the cards for the TV's focus ring: a scroller clips what overflows it. */}
      <ul className={cx("flex gap-3 overflow-x-auto py-3 [scrollbar-width:none]", tv && "-mx-6 gap-5 px-6 py-5")}>
        {toWatch.slice(0, SHELF_SIZE).map((item) => (
          <li key={item.id} className="w-[7.5rem] shrink-0">
            <ShelfCard item={item} tv={tv} onPick={pick} />
          </li>
        ))}
        {tv ? null : (
          <li className="w-[7.5rem] shrink-0">
            <Link
              href={listPath(circleUi)}
              className="grid aspect-[2/3] w-full place-items-center rounded-control border border-dashed border-line-strong text-sm font-semibold text-fg-muted"
            >
              <span className="grid justify-items-center gap-1">
                <Plus aria-hidden className="size-5" />
                Ajouter
              </span>
            </Link>
          </li>
        )}
      </ul>
      <WatchlistItemSheet item={toWatch.find((i) => i.id === openId) ?? null} me={me} onClose={() => setOpenId(null)} />
    </section>
  );
}

function ShelfCard({ item, tv, onPick }: { item: WatchlistItem; tv: boolean; onPick: (item: WatchlistItem) => void }) {
  const wanters = item.sharedWith
    .filter((person) => item.wantedBy.includes(person.accountId))
    .map((person) => ({ id: person.accountId, name: person.name, color: person.color }));
  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      aria-label={`${item.title.title}, ${describeTitle(item.title)}${tv && item.title.type === "movie" ? " : OK pour lancer" : ""}`}
      className="grid w-full cursor-pointer gap-2 rounded-control text-left"
    >
      <span className="relative block">
        <Poster title={item.title} size="card" />
        {wanters.length ? <BubbleStack people={wanters} className="absolute bottom-2 left-2" /> : null}
      </span>
      <span className="grid gap-0.5 px-0.5">
        <span className="truncate text-sm font-semibold text-fg">{item.title.title}</span>
        <span className="truncate text-xs text-fg-muted">{describeTitle(item.title)}</span>
      </span>
    </button>
  );
}
