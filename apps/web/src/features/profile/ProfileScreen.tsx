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
      <ScreenTopBar back="/" title="Profil" />
      {account ? (
        <main className="grid flex-1 items-start gap-[clamp(16px,3vw,32px)] py-6 lg:grid-cols-[380px_1fr]">
          <div className="grid gap-4">
            <MeCard account={account} />
            <AccountCard />
          </div>
          <Sessions account={account} />
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
