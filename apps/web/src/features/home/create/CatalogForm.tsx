import type { PlayCatalogRequest } from "@annamour/protocol";
import { Button } from "../../../ui/controls.tsx";
import { Sheet } from "../../../ui/Sheet.tsx";
import { CatalogPicker } from "./CatalogPicker.tsx";

interface CatalogFormProps {
  error: string | null;
  onPlay: (play: PlayCatalogRequest) => void;
  onPasteLink: () => void;
  onCancel: () => void;
}

/** « Nouvelle séance » by name: type a title, pick it (and its episode), the séance is ready. */
export function CatalogForm({ error, onPlay, onPasteLink, onCancel }: CatalogFormProps) {
  return (
    <div className="grid min-w-0 gap-4">
      <Sheet.Lede>Tape le nom d'un film ou d'une série. On s'occupe du reste.</Sheet.Lede>
      <CatalogPicker onPick={onPlay} error={error} />
      <Sheet.Actions>
        <Button onClick={onCancel}>Annuler</Button>
        <Button onClick={onPasteLink}>Coller un lien</Button>
      </Sheet.Actions>
    </div>
  );
}
