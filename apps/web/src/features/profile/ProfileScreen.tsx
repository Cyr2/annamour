import type { Account, SessionSummary } from "@annamour/protocol";
import { useCallback, useMemo, useState } from "react";
import { ScreenTopBar } from "../../ui/ScreenTopBar.tsx";
import { toast } from "../../ui/toast.ts";
import { useAccount } from "../account/account.ts";
import { favoriteOf, rankPeople, withPerson } from "../sessions/session-rules.ts";
import { hideSession, useSessions } from "../sessions/sessions.ts";
import { useLoadSessions } from "../sessions/useLoadSessions.ts";
import { AccountCard } from "./AccountCard.tsx";
import { MeCard } from "./MeCard.tsx";
import { PeopleRow } from "./PeopleRow.tsx";
import { SessionHistory } from "./SessionHistory.tsx";

/** Profile: my bubble and account on one side, who I watch with and my sessions on the other. */
export function ProfileScreen() {
  const account = useAccount((s) => s.account);
  return (
    <div className="safe-area mx-auto flex min-h-dvh max-w-[1240px] flex-col">
      <ScreenTopBar title={<h1 className="truncate">Profil</h1>} />
      {account ? (
        // On a phone: me, then my séances, then the account settings. Wide: me and the account on the left.
        <main className="grid flex-1 items-start gap-4 py-6 sm:gap-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-8">
          <div className="lg:col-start-1 lg:row-start-1">
            <MeCard account={account} />
          </div>
          <div className="mt-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
            <Sessions account={account} />
          </div>
          <div className="lg:col-start-1 lg:row-start-2">
            <AccountCard />
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
