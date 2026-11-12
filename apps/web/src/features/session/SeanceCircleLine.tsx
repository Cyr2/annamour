import { type SessionSummary, seanceCircleLine } from "@annamour/protocol";
import { useEffect } from "react";
import { useRoom } from "../../sync/room.ts";
import { useAccount } from "../account/account.ts";
import { reloadSessions } from "../sessions/sessions.ts";

/**
 * Whose séance this is, said quietly in the salon: « Cercle · Les potes du jeudi », « avec Léo et Inès ».
 * A guest reads the circle's people, without « toi ». Nothing for a séance outside any circle.
 */
export function SeanceCircleLine({ seance }: { seance: SessionSummary | undefined }) {
  const me = useAccount((s) => s.account?.id ?? "");
  const you = useRoom((s) => s.you);
  const people = useRoom((s) => s.members.length);
  // The server records who is here once they are in the room, and a second person gives a new séance
  // its circle: my séances are read again then, or a newcomer would not find this one yet.
  // A read already on its way may have left before this device entered: a fresh one is asked for.
  useEffect(() => {
    if (me && you && people > 0) void reloadSessions();
  }, [me, you, people]);
  const line = seance?.circle ? seanceCircleLine(seance.circle, me) : null;
  if (!line) return null;
  return <p className="max-w-[40ch] truncate text-sm text-fg-muted">{line}</p>;
}
