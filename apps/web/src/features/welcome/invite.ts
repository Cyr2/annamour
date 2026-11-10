import { isRoomCode, type Member, normalizeRoomCode, type RoomSnapshot } from "@annamour/protocol";
import { useEffect, useState } from "react";
import { ApiRequestError } from "../../api/http.ts";
import { fetchRoom } from "../../api/rooms.ts";
import { joinNames } from "../../lib/format.ts";

/* Who a séance link comes from, and for what: read before the guest picks how to come in. */

/** Everyone in the séance, someone on two devices once. */
export function invitePeople(members: readonly Member[]): Member[] {
  const byName = new Map<string, Member>();
  for (const member of members) if (!byName.has(member.name)) byName.set(member.name, member);
  return [...byName.values()];
}

/** « Léo t'attend pour « Dune ». », « Léo et Inès t'attendent… », or just the title while nobody is there. */
export function inviteLine(title: string, members: readonly Member[]): string {
  const names = invitePeople(members).map((member) => member.name);
  if (names.length === 0) return `Une séance t'attend : « ${title} ».`;
  return `${joinNames(names)} ${names.length > 1 ? "t'attendent" : "t'attend"} pour « ${title} ».`;
}

/** The séance behind the link: unknown while loading or offline, gone once the server says so. */
export type Invite = { status: "unknown" } | { status: "gone" } | { status: "found"; room: RoomSnapshot };

export function useInvite(code: string | undefined): Invite {
  const [invite, setInvite] = useState<Invite>({ status: "unknown" });

  useEffect(() => {
    if (code === undefined) return;
    const normalized = normalizeRoomCode(code);
    if (!isRoomCode(normalized)) return setInvite({ status: "gone" });
    let stopped = false;
    fetchRoom(normalized).then(
      (room) => {
        if (!stopped) setInvite({ status: "found", room });
      },
      (error: unknown) => {
        // Offline or a server hiccup: the guest still comes in, and the salon says what is wrong.
        if (!stopped && error instanceof ApiRequestError && error.status === 404) setInvite({ status: "gone" });
      },
    );
    return () => {
      stopped = true;
    };
  }, [code]);

  return invite;
}
