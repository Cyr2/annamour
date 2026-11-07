import {
  sortWatchlist,
  splitWatchlist,
  type WatchlistItem,
  type WatchlistSort,
  watchlistWith,
} from "@annamour/protocol";
import { Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { plural } from "../../lib/format.ts";
import { BrandBar } from "../../ui/BrandBar.tsx";
import { Button, SegmentedControl } from "../../ui/controls.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { toast } from "../../ui/toast.ts";
import { useAccount } from "../account/account.ts";
import { rankPeople } from "../sessions/session-rules.ts";
import { useSessions } from "../sessions/sessions.ts";
import { useLoadSessions } from "../sessions/useLoadSessions.ts";
import { AddToWatchlistSheet } from "./AddToWatchlistSheet.tsx";
import { PersonFilter } from "./PersonFilter.tsx";
import { useLoadWatchlist } from "./useLoadWatchlist.ts";
import { WatchlistItemSheet } from "./WatchlistItemSheet.tsx";
import { WatchlistRow } from "./WatchlistRow.tsx";
import { loadWatchlist, toggleWant, useWatchlist } from "./watchlist.ts";
import { peopleOf } from "./watchlist-rules.ts";

const SORTS = [
  { value: "wants", label: "Le plus d'envies" },
  { value: "recent", label: "Ajouté récemment" },
] as const;

/** The « À regarder » tab: everything shared with me, filtered by person, the most wanted first. */
export function WatchlistScreen() {
  useLoadWatchlist();
  const me = useAccount((s) => s.account?.id ?? "");
  const { status, items, error } = useWatchlist();
  const [person, setPerson] = useState<string | null>(null);
  const [sort, setSort] = useState<WatchlistSort>("wants");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  useLoadSessions();
  const sessions = useSessions((s) => s.sessions);
  const known = useMemo(() => new Set(rankPeople(sessions).map((p) => p.accountId)), [sessions]);
  const people = useMemo(() => peopleOf(items, me, known), [items, me, known]);
  const { toWatch, watched } = useMemo(
    () => splitWatchlist(sortWatchlist(watchlistWith(items, person), sort)),
    [items, person, sort],
  );
  const open = items.find((item) => item.id === openId) ?? null;
  const want = (item: WatchlistItem, value: boolean) =>
    void toggleWant(item.id, me, value).catch((failure: Error) => toast({ message: failure.message }));
  const now = Date.now();

  return (
    <div className="safe-area mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col">
      <BrandBar />
      <main className="mx-auto grid w-full max-w-[760px] content-start gap-5 py-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="type-heading">À regarder</h1>
          <Button variant="filled" icon={<Plus />} onClick={() => setAdding(true)}>
            Ajouter
          </Button>
        </header>
        {people.length > 0 ? (
          <PersonFilter people={people} selected={person} onSelect={setPerson} legend="Filtrer par personne" />
        ) : null}
        <SegmentedControl
          aria-label="Trier"
          className="am-sort-segments self-start"
          items={SORTS.map((s) => ({ value: s.value, label: s.label }))}
          value={sort}
          onValueChange={(value) => setSort(value === "recent" ? "recent" : "wants")}
        />
        {status === "loading" || status === "idle" ? (
          <div className="grid place-items-center py-10">
            <ThreadSpinner />
          </div>
        ) : null}
        {status === "error" ? (
          <div className="grid justify-items-start gap-3">
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
            <Button icon={<RefreshCw />} onClick={() => void loadWatchlist()}>
              Réessayer
            </Button>
          </div>
        ) : null}
        {status === "ready" && items.length === 0 ? <EmptyList onAdd={() => setAdding(true)} /> : null}
        <Section title="À regarder" items={toWatch} me={me} now={now} onOpen={(i) => setOpenId(i.id)} onWant={want} />
        <Section title="Vus" items={watched} me={me} now={now} onOpen={(i) => setOpenId(i.id)} onWant={want} />
      </main>
      <AddToWatchlistSheet open={adding} onClose={() => setAdding(false)} />
      <WatchlistItemSheet item={open} me={me} onClose={() => setOpenId(null)} />
    </div>
  );
}

interface SectionProps {
  title: string;
  items: WatchlistItem[];
  me: string;
  now: number;
  onOpen: (item: WatchlistItem) => void;
  onWant: (item: WatchlistItem, want: boolean) => void;
}

function Section({ title, items, me, now, onOpen, onWant }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <section className="grid gap-2.5" aria-label={`${title}, ${plural(items.length, "titre")}`}>
      <h2 className="type-label px-1">
        {title} · {items.length}
      </h2>
      <ul className="grid gap-2">
        {items.map((item) => (
          <WatchlistRow key={item.id} item={item} me={me} now={now} onOpen={onOpen} onWant={onWant} />
        ))}
      </ul>
    </section>
  );
}

function EmptyList({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="grid justify-items-start gap-4 rounded-panel border border-dashed border-line-strong p-5 sm:p-6">
      <p className="text-sm text-fg-muted">
        Ajoute un film ou une série que tu veux voir avec quelqu'un : il apparaîtra aussi dans sa liste.
      </p>
      <Button variant="filled" icon={<Plus />} onClick={onAdd}>
        Ajouter un titre
      </Button>
    </div>
  );
}
