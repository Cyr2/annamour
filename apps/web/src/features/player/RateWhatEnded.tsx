import type { RoomSnapshot } from "@annamour/protocol";
import { useAccount } from "../account/account.ts";
import { TitleRatings } from "../ratings/TitleRatings.tsx";
import { type EpisodeEnd, titleToRate } from "./episode-rules.ts";

/**
 * « Ton avis » at the end of a film, or of a series' last queued episode: each
 * person answers for themself, and sees the others' as they come. Not for a guest.
 */
export function RateWhatEnded({ room, end }: { room: RoomSnapshot; end: EpisodeEnd }) {
  const member = useAccount((state) => state.status === "member");
  const title = titleToRate(room, end);
  if (!member || !title) return null;
  return <TitleRatings title={title} className="surface-tile p-4" />;
}
