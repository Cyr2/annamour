import type { Member } from "@annamour/protocol";
import { useMemo } from "react";
import { useRoom } from "../../sync/room.ts";
import { type SlowestLead, slowestLead } from "./readying-rules.ts";

export interface WaitingForOthers {
  /** Others whose video is loading (the film waits for them). */
  loading: Member[];
  /** While starting together: whose download the room waits for, when it is worth saying. */
  slowest: SlowestLead | null;
  /** Nothing to wait for: the big play button may show. */
  calm: boolean;
}

/** What the film is waiting for, if anything: someone loading, or everyone's lead before starting. */
export function useWaitingForOthers(
  you: string | null,
  { active, over }: { active: boolean; over: boolean },
): WaitingForOthers {
  const shown = active && !over;
  // Select the stable array, derive during render: a filtering selector would return a new array every time.
  const members = useRoom((s) => s.members);
  const readying = useRoom((s) => s.readying);
  const loading = useMemo(() => members.filter((m) => m.buffering && m.id !== you), [members, you]);
  const slowest = useMemo(
    () => (shown && loading.length === 0 ? slowestLead(members, readying, you) : null),
    [shown, loading, members, readying, you],
  );
  return { loading, slowest, calm: loading.length === 0 && readying === null };
}
