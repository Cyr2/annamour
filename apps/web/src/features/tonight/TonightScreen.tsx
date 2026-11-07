import { circleTitle, type WatchlistItem } from "@annamour/protocol";
import { LogIn, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { BrandBar } from "../../ui/BrandBar.tsx";
import { Button } from "../../ui/controls.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { useAccount } from "../account/account.ts";
import { CircleSwitcher } from "../circles/CircleSwitcher.tsx";
import { ofCircle, tonightPick } from "../circles/circle-rules.ts";
import { loadCircles, useShownCircle } from "../circles/circles.ts";
import { CreateSessionSheet } from "../home/create/CreateSessionSheet.tsx";
import { asksToCreate } from "../home/create/create-link.ts";
import { SessionRow } from "../profile/SessionRow.tsx";
import { isFinished } from "../sessions/session-rules.ts";
import { hideSession, useSessions } from "../sessions/sessions.ts";
import { useLoadSessions } from "../sessions/useLoadSessions.ts";
import { AddToWatchlistSheet } from "../watchlist/AddToWatchlistSheet.tsx";
import { useLoadWatchlist } from "../watchlist/useLoadWatchlist.ts";
import { WatchlistItemSheet } from "../watchlist/WatchlistItemSheet.tsx";
import { WatchlistShelf } from "../watchlist/WatchlistShelf.tsx";
import { useWatchlist } from "../watchlist/watchlist.ts";
import { TonightCard } from "./TonightCard.tsx";

/**
 * « Ce soir », the home screen: with whom (« Avec qui ce soir ? »), the one
 * thing to watch (« On regarde ? »), what is under way, and our list.
 */
export function TonightScreen() {
  useLoadSessions();
  useLoadWatchlist();
  useEffect(() => void loadCircles(), []);
  const account = useAccount((s) => s.account);
  const me = account?.id ?? "";
  const circle = useShownCircle();
  const sessions = useSessions((s) => s.sessions);
  const items = useWatchlist((s) => s.items);
  const pick = useMemo(() => tonightPick(sessions, items, circle, me), [sessions, items, circle, me]);
  const ongoing = useMemo(
    () =>
      ofCircle(sessions, circle, me).filter(
        (session) => !isFinished(session) && !(pick.kind === "resume" && pick.session.code === session.code),
      ),
    [sessions, circle, me, pick],
  );
  const [creating, setCreating] = useCreateFromLink();
  const [adding, setAdding] = useState(false);
  const [openItem, setOpenItem] = useState<WatchlistItem | null>(null);
  const withWhom = circle ? ` avec ${circleTitle(circle, me)}` : "";
  const meBubble = account ? { id: account.id, name: account.name, color: account.color } : null;

  return (
    <div className="safe-area mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col">
      <BrandBar />
      <main className="mx-auto grid w-full max-w-[760px] content-start gap-6 py-6">
        <h1 className="sr-only">Ce soir{withWhom}</h1>
        <CircleSwitcher />
        <TonightCard pick={pick} me={me} onOpenItem={setOpenItem} onAdd={() => setAdding(true)} />
        {ongoing.length > 0 && meBubble ? (
          <section className="grid gap-2.5" aria-labelledby="ongoing-title">
            <h2 id="ongoing-title" className="type-heading">
              En cours{withWhom}
            </h2>
            <ul className="grid gap-2.5">
              {ongoing.map((session) => (
                <SessionRow
                  key={session.code}
                  session={session}
                  me={meBubble}
                  now={Date.now()}
                  onRemove={(s) => void hideSession(s.code).catch(() => {})}
                />
              ))}
            </ul>
          </section>
        ) : null}
        <WatchlistShelf circle={circle} title="Notre liste" />
        <div className="flex flex-wrap gap-3">
          <Button icon={<Plus />} onClick={() => setCreating(true)}>
            Créer une séance
          </Button>
          <LinkButton href="/rejoindre" icon={<LogIn />}>
            J'ai un code
          </LinkButton>
        </div>
      </main>
      <CreateSessionSheet open={creating} onClose={() => setCreating(false)} />
      <AddToWatchlistSheet open={adding} onClose={() => setAdding(false)} />
      <WatchlistItemSheet item={openItem} me={me} onClose={() => setOpenItem(null)} />
    </div>
  );
}

/** `/?creer` (the link the profile and the TV share) opens the create sheet, then leaves the address. */
function useCreateFromLink(): [boolean, (open: boolean) => void] {
  const asked = asksToCreate(useSearch());
  const [creating, setCreating] = useState(asked);
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!asked) return;
    setCreating(true);
    navigate("/", { replace: true });
  }, [asked, navigate]);
  return [creating, setCreating];
}
