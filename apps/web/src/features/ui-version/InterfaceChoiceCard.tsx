import { useLocation } from "wouter";
import { Switch } from "../../ui/controls.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { useTv } from "../tv/tv-context.ts";
import { setUiVersion, useCircleUi } from "./ui-version.ts";

/**
 * Tries the circles interface on this device, and back: same account, same
 * séances, only the screens change. Home is where each interface starts.
 */
export function InterfaceChoiceCard() {
  const circles = useCircleUi();
  const [, navigate] = useLocation();
  if (useTv()) return null;

  const change = (checked: boolean) => {
    setUiVersion(checked ? "circles" : "classic");
    navigate("/", { replace: true });
  };

  return (
    <Surface className="surface-panel grid gap-3 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 id="interface-choice-title" className="type-heading">
          Nouvelle interface
        </h2>
        <Switch checked={circles} onCheckedChange={change} aria-labelledby="interface-choice-title" />
      </div>
      <p className="text-sm text-pretty text-fg-muted">
        Ce soir, Notre liste et Nous : tes séances rangées par cercle, avec qui tu regardes. Mêmes séances, même compte,
        seuls les écrans changent. Réglé pour cet appareil.
      </p>
    </Surface>
  );
}
