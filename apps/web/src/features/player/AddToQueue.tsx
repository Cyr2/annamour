import type { CatalogRef, RoomSnapshot } from "@annamour/protocol";
import { useState } from "react";
import { addCatalogEpisode } from "../../api/catalog.ts";
import { errorMessage } from "../../api/http.ts";
import { addEpisode } from "../../api/rooms.ts";
import { currentIdentity } from "../../sync/identity.ts";
import { Button } from "../../ui/controls.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { CatalogPicker } from "../home/create/CatalogPicker.tsx";
import { AddLinkForm } from "./AddLinkForm.tsx";
import { NextEpisodeSuggestion } from "./NextEpisodeSuggestion.tsx";

/**
 * What to watch after: the next episode of the series in one tap, any film or
 * series by name, or a pasted link. Remounted after each add (keyed on the queue).
 */
export function AddToQueue({ room, onDone }: { room: RoomSnapshot; onDone: () => void }) {
  const [byLink, setByLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      onDone();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };
  // The others read who added it, found by this device's id.
  const { clientId } = currentIdentity();
  const addFromCatalog = (play: CatalogRef) => add(() => addCatalogEpisode(room.code, { ...play, clientId }));

  if (byLink) {
    return (
      <AddLinkForm
        room={room}
        busy={busy}
        error={error}
        onSubmit={(url, label) => add(() => addEpisode(room.code, url, label, clientId))}
        onSearch={() => setByLink(false)}
      />
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      <NextEpisodeSuggestion last={room.episodes.at(-1)?.catalog} disabled={busy} onAdd={addFromCatalog} />
      {busy ? (
        <div className="flex items-center gap-3 px-1 py-3 text-fg-muted" role="status">
          <ThreadSpinner /> On récupère la vidéo…
        </div>
      ) : (
        <CatalogPicker label="Ajouter un film ou une série" onPick={addFromCatalog} error={error} />
      )}
      <Sheet.Actions>
        <Button onClick={() => setByLink(true)}>Coller un lien</Button>
      </Sheet.Actions>
    </div>
  );
}
