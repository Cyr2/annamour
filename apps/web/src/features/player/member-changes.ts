import type { Member } from "@annamour/protocol";
import { memberById } from "../../sync/room.ts";

/** Who arrived and who left between two member lists, never counting yourself. */
export function memberChanges(before: Member[], after: Member[], you: string | null) {
  const others = (list: Member[]) => list.filter((m) => m.id !== you);
  return {
    joined: others(after).filter((m) => !memberById(before, m.id)),
    left: others(before).filter((m) => !memberById(after, m.id)),
  };
}
