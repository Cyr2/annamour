import { ListVideo, Maximize, SkipForward, Subtitles, Volume2, VolumeX } from "lucide-react";
import { Sheet } from "../../ui/Sheet.tsx";
import { AccountRow } from "../profile/AccountRow.tsx";
import { audibleLevel, useVolume } from "./volume.ts";

interface PlayerMoreSheetProps {
  open: boolean;
  onClose: () => void;
  onOpenTracks: () => void;
  onOpenUpNext: () => void;
  /** Absent on the last episode. */
  onSkipNext: (() => void) | undefined;
  onFullscreen: () => void;
}

/**
 * « ⋯ » on a phone held upright: what does not fit in the one-row bar.
 * Each choice runs from the tap itself (full screen needs that gesture), then
 * the sheet closes.
 */
export function PlayerMoreSheet({ open, onClose, ...actions }: PlayerMoreSheetProps) {
  const silent = useVolume((s) => audibleLevel(s) === 0);
  const toggleMute = useVolume((s) => s.toggleMute);
  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Plus d'options">
      <div className="grid gap-1">
        <AccountRow
          icon={<Subtitles />}
          title="Audio et sous-titres"
          detail="Ne change que pour toi"
          onClick={run(actions.onOpenTracks)}
        />
        <AccountRow
          icon={<ListVideo />}
          title="Épisodes"
          detail="Choisir ou ajouter la suite"
          onClick={run(actions.onOpenUpNext)}
        />
        {actions.onSkipNext ? (
          <AccountRow
            icon={<SkipForward />}
            title="Épisode suivant"
            detail="Pour tout le monde"
            onClick={run(actions.onSkipNext)}
          />
        ) : null}
        <AccountRow
          icon={silent ? <Volume2 /> : <VolumeX />}
          title={silent ? "Remettre le son" : "Couper le son"}
          detail="Le volume reste à toi"
          onClick={run(toggleMute)}
        />
        <AccountRow
          icon={<Maximize />}
          title="Plein écran"
          detail="Tourne le téléphone pour l'image entière"
          onClick={run(actions.onFullscreen)}
        />
      </div>
    </Sheet>
  );
}
