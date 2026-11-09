import { sortWatchlist, splitWatchlist } from "@annamour/protocol";
import { ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { BrandFooter } from "../../ui/BrandFooter.tsx";
import { Button, SegmentedControl } from "../../ui/controls.tsx";
import { toast } from "../../ui/toast.ts";
import { useAccount } from "../account/account.ts";
import { ofCircle } from "../circles/circle-rules.ts";
import { loadCircles, useShownCircle } from "../circles/circles.ts";
import { AddToWatchlistSheet } from "../watchlist/AddToWatchlistSheet.tsx";
import { useLoadWatchlist } from "../watchlist/useLoadWatchlist.ts";
import { WatchlistItemSheet } from "../watchlist/WatchlistItemSheet.tsx";
import { toggleWant, useWatchlist } from "../watchlist/watchlist.ts";
import { CircleFilter } from "./CircleFilter.tsx";
import { PosterGrid, type PosterHandlers } from "./PosterGrid.tsx";

/**
 * « Notre liste »: « Avec qui ? » as a row of bubbles, then the titles to
 * watch as posters, the most wanted first; « Déjà vus ensemble » on its own page.
 */
export function OurListScreen() {
  useLoadWatchlist();
  useEffect(() => void loadCircles(), []);
  const me = useAccount((s) => s.account?.id ?? "");
  const circle = useShownCircle();
  const items = useWatchlist((s) => s.items);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const watchedPage = new URLSearchParams(useSearch()).has("vus");
  const [, navigate] = useLocation();

  const titles = useMemo(
    () => splitWatchlist(sortWatchlist(ofCircle(items, circle, me), "wants")),
    [items, circle, me],
  );
  const handlers: PosterHandlers = {
    me,
    onPick: (item) => setOpenId(item.id),
    onWant: (item, want) =>
      void toggleWant(item.id, me, want).catch((failure: Error) => toast({ message: failure.message })),
  };

  return (
    <div className="safe-area mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col">
      <main className="mx-auto grid w-full max-w-[760px] content-start gap-6 py-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="type-heading">Notre liste</h1>
          <Button variant="filled" icon={<Plus />} onClick={() => setAdding(true)}>
            Ajouter
          </Button>
        </header>
        <CircleFilter />
        <SegmentedControl
          aria-label="Quels titres"
          className="am-state-segments justify-self-start"
          items={[
            { value: "to-watch", label: `À voir · ${titles.toWatch.length}` },
            { value: "watched", label: `Déjà vus · ${titles.watched.length}` },
          ]}
          value={watchedPage ? "watched" : "to-watch"}
          // The address follows, so « Déjà vus » can be linked to and the back button undoes it.
          onValueChange={(value) => navigate(value === "watched" ? "/liste?vus" : "/liste", { replace: true })}
        />
        {watchedPage ? (
          <Watched handlers={handlers} items={titles.watched} />
        ) : titles.toWatch.length ? (
          <PosterGrid items={titles.toWatch} label="Titres à voir" {...handlers} />
        ) : (
          <p className="px-1 text-sm text-fg-muted">Rien à voir pour l'instant : ajoutez un film ou une série.</p>
        )}
      </main>
      <BrandFooter />
      <AddToWatchlistSheet open={adding} onClose={() => setAdding(false)} />
      <WatchlistItemSheet item={items.find((i) => i.id === openId) ?? null} me={me} onClose={() => setOpenId(null)} />
    </div>
  );
}

/** « Déjà vus ensemble »: the titles watched. The séances themselves, over or not, live in « Séances ». */
function Watched({
  handlers,
  items,
}: {
  handlers: PosterHandlers;
  items: ReturnType<typeof splitWatchlist>["watched"];
}) {
  return (
    <div className="grid gap-6">
      {items.length ? (
        <PosterGrid items={items} label="Titres vus" {...handlers} />
      ) : (
        <p className="px-1 text-sm text-fg-muted">Rien de vu pour l'instant.</p>
      )}
      <Link
        href="/seances"
        className="surface-tile flex min-h-14 items-center gap-3 px-4 text-sm font-semibold text-fg"
      >
        <span className="flex-1">Les séances terminées</span>
        <ChevronRight aria-hidden className="size-4 text-fg-muted" />
      </Link>
    </div>
  );
}
