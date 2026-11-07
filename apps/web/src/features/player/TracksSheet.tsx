import type { Media } from "@annamour/protocol";
import { Button } from "../../ui/controls.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { TrackPickers } from "./TrackPickers.tsx";

interface TracksSheetProps {
  open: boolean;
  onClose: () => void;
  code: string;
  media: Media | undefined;
}

/** « Audio et sous-titres »: a personal choice, never sent to the room. */
export function TracksSheet({ open, onClose, code, media }: TracksSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Audio et sous-titres">
      <Sheet.Lede>Ce réglage ne change que pour toi.</Sheet.Lede>
      {media ? <TrackPickers code={code} media={media} /> : null}
      <Sheet.Actions>
        <Button variant="filled" onClick={onClose}>
          Terminé
        </Button>
      </Sheet.Actions>
    </Sheet>
  );
}
