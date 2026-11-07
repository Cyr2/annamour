import {
  type SessionSummary,
  sortWatchlist,
  splitWatchlist,
  type WatchlistItem,
  type WatchlistSort,
} from "@annamour/protocol";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BrandBar } from "../../ui/BrandBar.tsx";
import { Button, SegmentedControl } from "../../ui/controls.tsx";
import { toast } from "../../ui/toast.ts";
import { useAccount } from "../account/account.ts";
import { CircleSwitcher } from "../circles/CircleSwitcher.tsx";
import { type ListState, ofCircle } from "../circles/circle-rules.ts";
import { loadCircles, useShownCircle } from "../circles/circles.ts";
import { SessionRow } from "../profile/SessionRow.tsx";
import { splitByStatus } from "../sessions/session-rules.ts";
import { hideSession, useSessions } from "../sessions/sessions.ts";
import { useLoadSessions } from "../sessions/useLoadSessions.ts";
import { AddToWatchlistSheet } from "../watchlist/AddToWatchlistSheet.tsx";
import { useLoadWatchlist } from "../watchlist/useLoadWatchlist.ts";
import { WatchlistItemSheet } from "../watchlist/WatchlistItemSheet.tsx";
import { WatchlistRow } from "../watchlist/WatchlistRow.tsx";
import { toggleWant, useWatchlist } from "../watchlist/watchlist.ts";

const STATES = [
  { value: "to-watch", label: "À voir" },
  { value: "ongoing", label: "En cours" },
  { value: "watched", label: "Vus" },
] as const;

const SORTS = [
  { value: "wants", label: "Le plus d'envies" },
  { value: "recent", label: "Ajouté récemment" },
] as const;

/** « Notre liste »: every title of the circle on screen, to watch, under way or watched, in one place. */
export function OurListScreen() {
  useLoadSessions();
  useLoadWatchlist();
  useEffect(() => void loadCircles(), []);
  const account = useAccount((s) => s.account);
  const me = account?.id ?? "";
  const circle = useShownCircle();
  const sessions = useSessions((s) => s.sessions);
  const items = useWatchlist((s) => s.items);
  const [state, setState] = useState<ListState>("to-watch");
  const [sort, setSort] = useState<WatchlistSort>("wants");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const titles = useMemo(
    () => splitWatchlist(sortWatchlist(ofCircle(items, circle, me), sort)),
    [items, circle, me, sort],
  );
  const seances = useMemo(() => splitByStatus(ofCircle(sessions, circle, me)), [sessions, circle, me]);
  const want = (item: WatchlistItem, value: boolean) =>
    void toggleWant(item.id, me, value).catch((failure: Error) => toast({ message: failure.message }));
  const meBubble = account ? { id: account.id, name: account.name, color: account.color } : null;
  const now = Date.now();

  return (
    <div className="safe-area mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col">
      <BrandBar />
      <main className="mx-auto grid w-full max-w-[760px] content-start gap-5 py-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="type-heading">Notre liste</h1>
          <Button variant="filled" icon={<Plus />} onClick={() => setAdding(true)}>
            Ajouter
          </Button>
        </header>
        <CircleSwitcher legend="Avec qui ?" />
        <SegmentedControl
          aria-label="Quels titres"
          className="am-state-segments justify-self-start"
          items={STATES.map((s) => ({ value: s.value, label: s.label }))}
          value={state}
          onValueChange={(value) => setState(STATES.find((s) => s.value === value)?.value ?? "to-watch")}
        />
        {state === "to-watch" ? (
          <>
            <SegmentedControl
              aria-label="Trier"
              className="am-sort-segments justify-self-start"
              items={SORTS.map((s) => ({ value: s.value, label: s.label }))}
              value={sort}
              onValueChange={(value) => setSort(value === "recent" ? "recent" : "wants")}
            />
            <Titles
              items={titles.toWatch}
              me={me}
              now={now}
              onOpen={(i) => setOpenId(i.id)}
              onWant={want}
              empty="Rien à voir pour l'instant : ajoutez un film ou une série."
            />
          </>
        ) : null}
        {state === "ongoing" && meBubble ? (
          <Seances sessions={seances.ongoing} me={meBubble} now={now} empty="Aucune séance en cours." />
        ) : null}
        {state === "watched" && meBubble ? (
          <>
            <Titles items={titles.watched} me={me} now={now} onOpen={(i) => setOpenId(i.id)} onWant={want} empty="" />
            <Seances
              sessions={seances.finished}
              me={meBubble}
              now={now}
              empty={titles.watched.length ? "" : "Rien de vu pour l'instant."}
            />
          </>
        ) : null}
      </main>
      <AddToWatchlistSheet open={adding} onClose={() => setAdding(false)} />
      <WatchlistItemSheet item={items.find((i) => i.id === openId) ?? null} me={me} onClose={() => setOpenId(null)} />
    </div>
  );
}

interface TitlesProps {
  items: WatchlistItem[];
  me: string;
  now: number;
  onOpen: (item: WatchlistItem) => void;
  onWant: (item: WatchlistItem, want: boolean) => void;
  empty: string;
}

function Titles({ items, me, now, onOpen, onWant, empty }: TitlesProps) {
  if (items.length === 0) return empty ? <p className="px-1 text-sm text-fg-muted">{empty}</p> : null;
  return (
    <ul className="grid gap-2" aria-label="Titres">
      {items.map((item) => (
        <WatchlistRow key={item.id} item={item} me={me} now={now} onOpen={onOpen} onWant={onWant} />
      ))}
    </ul>
  );
}

interface SeancesProps {
  sessions: SessionSummary[];
  me: { id: string; name: string; color: SessionSummary["participants"][number]["color"] };
  now: number;
  empty: string;
}

function Seances({ sessions, me, now, empty }: SeancesProps) {
  if (sessions.length === 0) return empty ? <p className="px-1 text-sm text-fg-muted">{empty}</p> : null;
  return (
    <ul className="grid gap-2.5" aria-label="Séances">
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
