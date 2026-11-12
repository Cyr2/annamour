import { type CatalogRef, catalogLabel, type RoomSnapshot } from "@annamour/protocol";
import { Plus } from "lucide-react";
import { useState } from "react";
import { addCatalogEpisode } from "../../api/catalog.ts";
import { errorMessage } from "../../api/http.ts";
import { currentIdentity } from "../../sync/identity.ts";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { Button } from "../../ui/controls.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { toast } from "../../ui/toast.ts";
import { useNextEpisode } from "./NextEpisodeSuggestion.tsx";

interface AddNextCardProps {
  room: RoomSnapshot;
  client: SyncClient | null;
  /** « Regarder le générique »: this card leaves this screen (the others keep theirs). */
  onDismiss: () => void;
}

/**
 * A series' episode ends with nothing queued: its next one, added and started
 * for everyone in one touch. Nothing when the season's list cannot be read or
 * the series is over.
 */
export function AddNextCard({ room, client, onDismiss }: AddNextCardProps) {
  const suggestion = useNextEpisode(room.episodes[room.current]?.catalog);
  const [busy, setBusy] = useState(false);
  if (!suggestion) return null;
  const { next, title } = suggestion;

  const addAndStart = async (episode: CatalogRef) => {
    setBusy(true);
    try {
      const index = await addCatalogEpisode(room.code, { ...episode, clientId: currentIdentity().clientId });
      client?.send({ type: "playEpisode", from: room.current, to: index });
    } catch (failure) {
      toast({ message: errorMessage(failure) });
      setBusy(false);
    }
  };

  return (
    <Surface className="surface-panel grid w-[min(24rem,calc(100vw-2rem))] gap-3 p-4">
      <div className="grid min-w-0">
        <span className="text-xs font-semibold text-accent">Épisode suivant · {catalogLabel(next)}</span>
        <strong className="truncate text-sm text-fg">{title ?? next.title}</strong>
        <span className="text-xs text-fg-muted" role="status">
          {busy ? "On récupère la vidéo…" : "Il n'est pas encore dans la file"}
        </span>
      </div>
      {/* Stacked, the main one on top: two long French labels never fit side by side on a card. */}
      <div className="flex flex-col-reverse gap-2">
        <Button onClick={onDismiss}>Regarder le générique</Button>
        <Button variant="filled" icon={<Plus />} disabled={busy} onClick={() => void addAndStart(next)} data-tv-primary>
          Ajouter et lancer
        </Button>
      </div>
    </Surface>
  );
}
