import { type SessionSummary, sortWatchlist, splitWatchlist } from "@annamour/protocol";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { BrandFooter } from "../../ui/BrandFooter.tsx";
import { Button } from "../../ui/controls.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { toast } from "../../ui/toast.ts";
import { useAccount } from "../account/account.ts";
import { ofCircle } from "../circles/circle-rules.ts";
import { loadCircles, useShownCircle } from "../circles/circles.ts";
import { SessionRow } from "../profile/SessionRow.tsx";
import { splitByStatus } from "../sessions/session-rules.ts";
import { hideSession, useSessions } from "../sessions/sessions.ts";
import { useLoadSessions } from "../sessions/useLoadSessions.ts";
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
  useLoadSessions();
  useLoadWatchlist();
  useEffect(() => void loadCircles(), []);
  const me = useAccount((s) => s.account?.id ?? "");
  const circle = useShownCircle();
  const items = useWatchlist((s) => s.items);
  const sessions = useSessions((s) => s.sessions);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const watchedPage = new URLSearchParams(useSearch()).has("vus");

  const titles = useMemo(
    () => splitWatchlist(sortWatchlist(ofCircle(items, circle, me), "wants")),
    [items, circle, me],
  );
  const finished = useMemo(() => splitByStatus(ofCircle(sessions, circle, me)).finished, [sessions, circle, me]);
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
          <h1 className="type-heading">{watchedPage ? "Déjà vus ensemble" : "Notre liste"}</h1>
          <Button variant="filled" icon={<Plus />} onClick={() => setAdding(true)}>
            Ajouter
          </Button>
        </header>
        <CircleFilter />
        {watchedPage ? (
          <>
            <LinkButton href="/liste" icon={<ChevronLeft />} className="justify-self-start">
              À voir
            </LinkButton>
            <Watched handlers={handlers} items={titles.watched} sessions={finished} />
          </>
        ) : (
          <>
            <section className="grid gap-3" aria-labelledby="to-watch-title">
              <div className="flex items-baseline justify-between gap-3 px-1">
                <h2 id="to-watch-title" className="type-heading">
                  À voir
                </h2>
                <span className="text-xs text-fg-muted">le plus d'envies d'abord</span>
              </div>
              {titles.toWatch.length ? (
                <PosterGrid items={titles.toWatch} label="Titres à voir" {...handlers} />
              ) : (
                <p className="px-1 text-sm text-fg-muted">Rien à voir pour l'instant : ajoutez un film ou une série.</p>
              )}
            </section>
            <WatchedLink count={titles.watched.length + finished.length} />
          </>
        )}
      </main>
      <BrandFooter />
      <AddToWatchlistSheet open={adding} onClose={() => setAdding(false)} />
      <WatchlistItemSheet item={items.find((i) => i.id === openId) ?? null} me={me} onClose={() => setOpenId(null)} />
    </div>
  );
}

function WatchedLink({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Link
      href="/liste?vus"
      className="surface-tile flex min-h-14 items-center gap-3 px-4 text-sm font-semibold text-fg"
    >
      <span className="flex-1">Déjà vus ensemble · {count}</span>
      <ChevronRight aria-hidden className="size-4 text-fg-muted" />
    </Link>
  );
}

type Me = { id: string; name: string; color: SessionSummary["participants"][number]["color"] };

function Watched({
  handlers,
  items,
  sessions,
}: {
  handlers: PosterHandlers;
  items: ReturnType<typeof splitWatchlist>["watched"];
  sessions: SessionSummary[];
}) {
  const account = useAccount((s) => s.account);
  if (items.length === 0 && sessions.length === 0) {
    return <p className="px-1 text-sm text-fg-muted">Rien de vu pour l'instant.</p>;
  }
  const me: Me | null = account ? { id: account.id, name: account.name, color: account.color } : null;
  const now = Date.now();
  return (
    <div className="grid gap-6">
      {items.length ? <PosterGrid items={items} label="Titres vus" {...handlers} /> : null}
      {sessions.length && me ? (
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
      ) : null}
    </div>
  );
}
