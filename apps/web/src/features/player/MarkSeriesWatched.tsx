import type { RoomSnapshot } from "@annamour/protocol";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../ui/controls.tsx";
import { toast } from "../../ui/toast.ts";
import { useAccount } from "../account/account.ts";
import { loadWatchlist, markWatched, useWatchlist } from "../watchlist/watchlist.ts";
import { seriesToMarkWatched } from "./episode-rules.ts";

/**
 * At the end of the last episode queued, a series that sits in Notre liste:
 * « Marquer la série comme vue ? », in one tap. Nothing for a guest, nor for a
 * series the list does not hold.
 */
export function MarkSeriesWatched({ room }: { room: RoomSnapshot }) {
  const member = useAccount((s) => s.status === "member");
  const items = useWatchlist((s) => s.items);
  const [marked, setMarked] = useState(false);
  const series = seriesToMarkWatched(items, room);

  useEffect(() => {
    if (member) void loadWatchlist();
  }, [member]);

  if (marked) return <p className="type-label text-center">Série marquée comme vue dans Notre liste.</p>;
  if (!member || !series) return null;

  const mark = async () => {
    setMarked(true);
    try {
      await markWatched(series.id, true);
    } catch (failure) {
      setMarked(false);
      toast({ message: failure instanceof Error ? failure.message : "Réessaie dans un instant." });
    }
  };
  return (
    <Button size="large" icon={<Check />} onClick={mark}>
      Marquer la série comme vue ?
    </Button>
  );
}
