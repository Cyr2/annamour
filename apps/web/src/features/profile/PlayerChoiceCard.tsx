import { useState } from "react";
import { offersPlayerChoice, playerChoice, setPlayerChoice } from "../../sync/player-choice.ts";
import { Switch } from "../../ui/controls.tsx";
import { Surface } from "../../ui/Surface.tsx";

/**
 * On an iPad: our player instead of Safari's, for a weak link. It keeps
 * minutes of video ahead rather than seconds, so a dip in the 4G passes
 * unnoticed instead of pausing the séance. Takes effect at the next film;
 * switched back off here.
 */
export function PlayerChoiceCard() {
  const [ownPlayer, setOwnPlayer] = useState(() => playerChoice() === "annamour");
  if (!offersPlayerChoice()) return null;

  const change = (checked: boolean) => {
    setPlayerChoice(checked ? "annamour" : "safari");
    setOwnPlayer(checked);
  };

  return (
    <Surface className="surface-panel grid gap-3 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 id="player-choice-title" className="type-heading">
          Moins de coupures
        </h2>
        <Switch checked={ownPlayer} onCheckedChange={change} aria-labelledby="player-choice-title" />
      </div>
      <p className="text-sm text-pretty text-fg-muted">
        Garde environ 5 minutes de film d'avance sur cet iPad, bien plus que le lecteur de Safari : une baisse de réseau
        passe sans couper la séance. AirPlay n'est pas disponible avec ce lecteur. Prend effet au prochain film.
      </p>
    </Surface>
  );
}
