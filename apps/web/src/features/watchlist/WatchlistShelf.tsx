import { type Circle, sortWatchlist, splitWatchlist, type WatchlistItem } from "@annamour/protocol";
import { ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { plural } from "../../lib/format.ts";
import { sessionPath } from "../../sync/restart.ts";
import { cx } from "../../ui/cx.ts";
import { toast } from "../../ui/toast.ts";
import { useAccount } from "../account/account.ts";
import { ofCircle, seanceToResume } from "../circles/circle-rules.ts";
import { circleForTitle, useCircles } from "../circles/circles.ts";
import { useSessions } from "../sessions/sessions.ts";
import { useTv } from "../tv/tv-context.ts";
import { FIRST_ROW, PosterCard } from "./PosterCard.tsx";
import { ShelfPlaceholder } from "./ShelfPlaceholder.tsx";
import { useLaunchTitle } from "./useLaunchTitle.ts";
import { useLoadWatchlist } from "./useLoadWatchlist.ts";
import { WatchlistItemSheet } from "./WatchlistItemSheet.tsx";
import { toggleWant, useWatchlist } from "./watchlist.ts";

const SHELF_SIZE = 10;

/**
 * « Notre liste » on « Ce soir » and the TV home: the most wanted titles still
 * to watch. On a TV, OK on a film starts it at once, or reopens its séance
 * under way in its circle (a series asks for its episode first); adding stays
 * on the phone.
 */
export function WatchlistShelf({
  circle = null,
  title = "Notre liste",
}: {
  /** Only this circle's titles (null: all of them). */
  circle?: Circle | null;
  title?: string;
}) {
  useLoadWatchlist();
  const tv = useTv();
  const me = useAccount((s) => s.account?.id ?? "");
  const items = useWatchlist((s) => s.items);
  // On a TV, OK on a film under way in its circle goes back to that séance.
  const sessions = useSessions((s) => s.sessions);
  const circles = useCircles((s) => s.circles);
  const toWatch = useMemo(
    () => splitWatchlist(sortWatchlist(ofCircle(items, circle, me), "wants")).toWatch,
    [items, circle, me],
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const { launch } = useLaunchTitle();
  const [, navigate] = useLocation();
  const loading = useWatchlist((s) => s.status === "idle" || s.status === "loading");
  // Its room is kept while the list is on its way: arriving, it pushed the rest of the page down.
  if (toWatch.length === 0) return loading ? <ShelfPlaceholder title={title} /> : null;

  const want = (item: WatchlistItem, value: boolean) =>
    void toggleWant(item.id, me, value).catch((failure: Error) => toast({ message: failure.message }));
  const pick = (item: WatchlistItem) => (tv && item.title.type === "movie" ? play(item) : setOpenId(item.id));
  const ongoingOf = (item: WatchlistItem) =>
    seanceToResume(item.title, { sessions, circleId: circleForTitle(item), circles, me });
  const play = (item: WatchlistItem) => {
    const ongoing = ongoingOf(item);
    if (ongoing) navigate(sessionPath(ongoing.code));
    else void launch(item);
  };
  const tvHint = (item: WatchlistItem) => {
    if (!tv || item.title.type !== "movie") return undefined;
    return ongoingOf(item) ? "OK pour reprendre" : "OK pour lancer";
  };

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
          <Link href="/liste" className="flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">
            Tout voir · {toWatch.length}
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        )}
      </div>
      {/* Room around the cards for the TV's focus ring: a scroller clips what overflows it. */}
      <ul className={cx("flex gap-3 overflow-x-auto py-3 [scrollbar-width:none]", tv && "-mx-6 gap-5 px-6 py-5")}>
        {toWatch.slice(0, SHELF_SIZE).map((item, index) => (
          <li key={item.id} className="w-[7.5rem] shrink-0">
            <PosterCard
              item={item}
              me={me}
              onPick={pick}
              onWant={tv ? undefined : want}
              hint={tvHint(item)}
              priority={index < FIRST_ROW}
            />
          </li>
        ))}
        {tv ? null : (
          <li className="w-[7.5rem] shrink-0">
            <Link
              href="/liste"
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
