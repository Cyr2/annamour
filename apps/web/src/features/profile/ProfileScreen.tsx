import type { Account, SessionSummary } from "@annamour/protocol";
import { useCallback, useMemo, useState } from "react";
import { BrandBar } from "../../ui/BrandBar.tsx";
import { cx } from "../../ui/cx.ts";
import { toast } from "../../ui/toast.ts";
import { useAccount } from "../account/account.ts";
import { favoriteOf, rankPeople, withPerson } from "../sessions/session-rules.ts";
import { hideSession, useSessions } from "../sessions/sessions.ts";
import { useLoadSessions } from "../sessions/useLoadSessions.ts";
import { useTv } from "../tv/tv-context.ts";
import { InterfaceChoiceCard } from "../ui-version/InterfaceChoiceCard.tsx";
import { AccountCard } from "./AccountCard.tsx";
import { MeCard } from "./MeCard.tsx";
import { PeopleRow } from "./PeopleRow.tsx";
import { PlayerChoiceCard } from "./PlayerChoiceCard.tsx";
import { SessionHistory } from "./SessionHistory.tsx";

/*
 * On a phone: me, then my séances, then the account settings. Wide: me and
 * the account on the left. On a TV, seen from the sofa: my séances first and
 * widest on the left, where the remote starts, me and the account in a
 * narrower column on the right; ← → moves between the two. The TV screen
 * never scrolls: only the list of séances does, inside its column.
 */
const LAYOUT = {
  phone: {
    page: "min-h-dvh",
    main: "gap-4 py-6 sm:gap-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-8",
    me: "lg:col-start-1 lg:row-start-1",
    sessions: "mt-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0",
    account: "lg:col-start-1 lg:row-start-2",
  },
  tv: {
    page: "h-dvh overflow-hidden",
    main: "min-h-0 grid-cols-[minmax(0,1fr)_26rem] grid-rows-[auto_minmax(0,1fr)] gap-x-10 gap-y-5 pt-4",
    me: "col-start-2 row-start-1",
    // The only part that scrolls, inside its column: room around for the focus ring.
    sessions:
      "col-start-1 row-span-2 row-start-1 -m-6 h-[calc(100%+3rem)] scroll-p-6 overflow-y-auto p-6 [scrollbar-width:none] [mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]",
    account: "col-start-2 row-start-2",
  },
} as const;

/** Profile: my bubble and account on one side, who I watch with and my sessions on the other. */
export function ProfileScreen() {
  const account = useAccount((s) => s.account);
  const tv = useTv();
  const layout = LAYOUT[tv ? "tv" : "phone"];
  return (
    <div className={cx("safe-area mx-auto flex w-full max-w-[1240px] flex-col", layout.page)}>
      <BrandBar />
      {account ? (
        <main className={cx("grid flex-1 items-start", layout.main)}>
          {/* The tab bar says where we are; the title stays for screen readers. */}
          <h1 className="sr-only">Profil</h1>
          <div className={layout.me}>
            <MeCard account={account} />
          </div>
          <div className={layout.sessions}>
            <Sessions account={account} />
          </div>
          <div className={cx("grid gap-4 sm:gap-6", layout.account)}>
            <AccountCard />
            {/* Only on an iPhone or iPad (it renders nothing elsewhere, and a TV never shows it). */}
            {tv ? null : <PlayerChoiceCard />}
            <InterfaceChoiceCard />
          </div>
        </main>
      ) : null}
    </div>
  );
}

function Sessions({ account }: { account: Account }) {
  useLoadSessions();
  const sessions = useSessions((s) => s.sessions);
  const status = useSessions((s) => s.status);
  const error = useSessions((s) => s.error);
  const [selected, setSelected] = useState<string | null>(null);

  const people = useMemo(() => rankPeople(sessions), [sessions]);
  const favoriteId = useMemo(() => favoriteOf(people), [people]);
  const shown = useMemo(() => withPerson(sessions, selected), [sessions, selected]);
  const personName = people.find((person) => person.accountId === selected)?.name ?? null;
  const me = useMemo(
    () => ({ id: account.id, name: account.name, color: account.color }),
    [account.id, account.name, account.color],
  );

  const remove = useCallback(async (session: SessionSummary) => {
    try {
      await hideSession(session.code);
      toast({ message: `« ${session.title} » retirée de tes séances` });
    } catch (failure) {
      toast({ message: failure instanceof Error ? failure.message : "Ça n'a pas marché. Réessaie." });
    }
  }, []);

  return (
    <div className="grid min-w-0 gap-5">
      {people.length > 0 ? (
        <PeopleRow
          people={people}
          favoriteId={favoriteId}
          totalSessions={sessions.length}
          selected={personName ? selected : null}
          onSelect={setSelected}
        />
      ) : null}
      <SessionHistory
        status={status}
        error={error}
        sessions={personName ? shown : sessions}
        personName={personName}
        me={me}
        onRemove={(session) => void remove(session)}
      />
    </div>
  );
}
