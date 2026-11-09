import type { WatchlistItem } from "@annamour/protocol";
import { LogIn, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { BrandFooter } from "../../ui/BrandFooter.tsx";
import { Button } from "../../ui/controls.tsx";
import { LinkButton } from "../../ui/LinkButton.tsx";
import { useAccount } from "../account/account.ts";
import { ofCircle, tonightPick } from "../circles/circle-rules.ts";
import { loadCircles, useShownCircle } from "../circles/circles.ts";
import { CreateSessionSheet } from "../home/create/CreateSessionSheet.tsx";
import { asksToCreate } from "../home/create/create-link.ts";
import { CircleFilter } from "../list/CircleFilter.tsx";
import { isFinished, isSameTitle, onePerTitle } from "../sessions/session-rules.ts";
import { useSessions } from "../sessions/sessions.ts";
import { useLoadSessions } from "../sessions/useLoadSessions.ts";
import { AddToWatchlistSheet } from "../watchlist/AddToWatchlistSheet.tsx";
import { useLoadWatchlist } from "../watchlist/useLoadWatchlist.ts";
import { WatchlistItemSheet } from "../watchlist/WatchlistItemSheet.tsx";
import { WatchlistShelf } from "../watchlist/WatchlistShelf.tsx";
import { useWatchlist } from "../watchlist/watchlist.ts";
import { OngoingShelf } from "./OngoingShelf.tsx";
import { TonightCard } from "./TonightCard.tsx";
import { TonightHero } from "./TonightHero.tsx";

/**
 * « Ce soir », the home screen: the red thread and « Une soirée ensemble »,
 * with whom (« Avec qui ce soir ? »), the one
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
      // A film started twice shows once, by its latest séance: the others stay in « Séances ».
      onePerTitle(ofCircle(sessions, circle, me)).filter(
        (session) =>
          !isFinished(session) &&
          !(pick.kind === "resume" && (pick.session.code === session.code || isSameTitle(pick.session, session))),
      ),
    [sessions, circle, me, pick],
  );
  const [creating, setCreating] = useCreateFromLink();
  const [adding, setAdding] = useState(false);
  const [openItem, setOpenItem] = useState<WatchlistItem | null>(null);

  return (
    <div className="safe-area mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col">
      <main className="mx-auto grid w-full max-w-[760px] content-start gap-6 py-6">
        <TonightHero circle={circle} />
        <CircleFilter centered />
        <TonightCard pick={pick} me={me} onOpenItem={setOpenItem} onAdd={() => setAdding(true)} />
        <OngoingShelf sessions={ongoing} />
        <div className="grid grid-cols-2 gap-3">
          <Button variant="filled" icon={<Plus />} onClick={() => setCreating(true)}>
            Créer une séance
          </Button>
          <LinkButton href="/rejoindre" icon={<LogIn />}>
            J'ai un code
          </LinkButton>
        </div>
        <WatchlistShelf circle={circle} title="Notre liste" />
      </main>
      <BrandFooter />
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
