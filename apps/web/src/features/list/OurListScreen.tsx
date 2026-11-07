import { type SessionSummary, sortWatchlist, splitWatchlist, type WatchlistItem } from "@annamour/protocol";
import { ChevronLeft, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { BrandBar } from "../../ui/BrandBar.tsx";
import { Button, SegmentedControl } from "../../ui/controls.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { toast } from "../../ui/toast.ts";
import { useAccount } from "../account/account.ts";
import { loadCircles, useCircles } from "../circles/circles.ts";
import { SessionRow } from "../profile/SessionRow.tsx";
import { splitByStatus } from "../sessions/session-rules.ts";
import { hideSession, useSessions } from "../sessions/sessions.ts";
import { useLoadSessions } from "../sessions/useLoadSessions.ts";
import { AddToWatchlistSheet } from "../watchlist/AddToWatchlistSheet.tsx";
import { useLoadWatchlist } from "../watchlist/useLoadWatchlist.ts";
import { WatchlistItemSheet } from "../watchlist/WatchlistItemSheet.tsx";
import { toggleWant, useWatchlist } from "../watchlist/watchlist.ts";
import { PosterGrid, type ShelfHandlers, ShelfRow, shelfName } from "./ShelfRow.tsx";
import { type Shelf, shelvesFor } from "./shelves.ts";

type Tab = "to-watch" | "watched";
const TABS = [
  { value: "to-watch", label: "À voir" },
  { value: "watched", label: "Déjà vus" },
] as const;

/**
 * « Notre liste »: the same posters as on « Ce soir », one floor per circle
 * (or a grid when there is only one); « Tout voir » opens a circle's grid.
 */
export function OurListScreen() {
  useLoadSessions();
  useLoadWatchlist();
  useEffect(() => void loadCircles(), []);
  const me = useAccount((s) => s.account?.id ?? "");
  const circles = useCircles((s) => s.circles);
  const items = useWatchlist((s) => s.items);
  const [tab, setTab] = useState<Tab>("to-watch");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const focus = new URLSearchParams(useSearch()).get("cercle");

  const titles = useMemo(() => splitWatchlist(sortWatchlist(items, "wants")), [items]);
  const shelves = useMemo(() => shelvesFor(circles, titles.toWatch, me), [circles, titles.toWatch, me]);
  const handlers: ShelfHandlers = {
    me,
    onPick: (item) => setOpenId(item.id),
    onWant: (item, want) =>
      void toggleWant(item.id, me, want).catch((failure: Error) => toast({ message: failure.message })),
  };
  const focused = focus ? shelves.find((shelf) => (shelf.circle?.id ?? "tous") === focus) : undefined;

  return (
    <div className="safe-area mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col">
      <BrandBar />
      <main className="mx-auto grid w-full max-w-[760px] content-start gap-6 py-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="type-heading">{focused ? shelfName(focused.circle, me) : "Notre liste"}</h1>
          <Button variant="filled" icon={<Plus />} onClick={() => setAdding(true)}>
            Ajouter
          </Button>
        </header>
        {focused ? (
          <>
            <LinkButton href="/liste" icon={<ChevronLeft />} className="justify-self-start">
              Toute la liste
            </LinkButton>
            <PosterGrid items={focused.items} label="Titres" {...handlers} />
          </>
        ) : (
          <>
            <SegmentedControl
              aria-label="Quels titres"
              className="am-state-segments justify-self-start"
              items={TABS.map((t) => ({ value: t.value, label: t.label }))}
              value={tab}
              onValueChange={(value) => setTab(value === "watched" ? "watched" : "to-watch")}
            />
            {tab === "to-watch" ? (
              <ToWatch shelves={shelves} handlers={handlers} />
            ) : (
              <Watched items={titles.watched} handlers={handlers} />
            )}
          </>
        )}
      </main>
      <AddToWatchlistSheet open={adding} onClose={() => setAdding(false)} />
      <WatchlistItemSheet item={items.find((i) => i.id === openId) ?? null} me={me} onClose={() => setOpenId(null)} />
    </div>
  );
}

function ToWatch({ shelves, handlers }: { shelves: Shelf[]; handlers: ShelfHandlers }) {
  const [first] = shelves;
  if (!first) {
    return <p className="px-1 text-sm text-fg-muted">Rien à voir pour l'instant : ajoutez un film ou une série.</p>;
  }
  // One circle (a couple, often): a grid, not a single row with the rest of the page empty.
  if (shelves.length === 1) return <PosterGrid items={first.items} label="Titres" {...handlers} />;
  return (
    <div className="grid gap-5">
      {shelves.map((shelf) => (
        <ShelfRow key={shelf.circle?.id ?? "tous"} circle={shelf.circle} items={shelf.items} {...handlers} />
      ))}
    </div>
  );
}

type Me = { id: string; name: string; color: SessionSummary["participants"][number]["color"] };

function Watched({ items, handlers }: { items: WatchlistItem[]; handlers: ShelfHandlers }) {
  const sessions = useSessions((s) => s.sessions);
  const account = useAccount((s) => s.account);
  const finished = useMemo(() => splitByStatus(sessions).finished, [sessions]);
  if (items.length === 0 && finished.length === 0) {
    return <p className="px-1 text-sm text-fg-muted">Rien de vu pour l'instant.</p>;
  }
  const me: Me | null = account ? { id: account.id, name: account.name, color: account.color } : null;
  return (
    <div className="grid gap-6">
      {items.length ? <PosterGrid items={items} label="Titres vus" {...handlers} /> : null}
      {finished.length && me ? <FinishedSeances sessions={finished} me={me} /> : null}
    </div>
  );
}

function FinishedSeances({ sessions, me }: { sessions: SessionSummary[]; me: Me }) {
  const now = Date.now();
  return (
    <ul className="grid gap-2.5" aria-label="Séances terminées">
      {sessions.map((session) => (
        <SessionRow
          key={session.code}
          session={session}
          me={me}
          now={now}
          onRemove={(s) => void hideSession(s.code).catch((failure: Error) => toast({ message: failure.message }))}
        />
      ))}
    </ul>
  );
}
