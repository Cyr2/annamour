import { useEffect, useState } from "react";
import { errorMessage } from "../../api/http.ts";
import { Switch } from "../../ui/controls.tsx";
import { Surface } from "../../ui/Surface.tsx";
import {
  deviceTraits,
  disableNotifications,
  enableNotifications,
  NOTIFICATIONS_HELP,
  notificationsAvailability,
  notificationsOn,
} from "./notifications.ts";

/**
 * « Notifications » on this device: a reminder before each evening planned
 * on a séance. Where the device cannot have them yet, says what to do.
 */
export function NotificationsCard() {
  const [availability] = useState(() => notificationsAvailability(deviceTraits()));
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (availability !== "ready") return;
    let live = true;
    void notificationsOn()
      .then((value) => live && setOn(value))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [availability]);

  const change = (checked: boolean) => {
    setBusy(true);
    setProblem(null);
    // Asked at once, inside the tap: Safari refuses the permission otherwise.
    const work = checked ? enableNotifications() : disableNotifications();
    void work
      .then(() => setOn(checked))
      .catch((failure: unknown) => setProblem(failure instanceof Error ? failure.message : errorMessage(failure)))
      .finally(() => setBusy(false));
  };

  const help = availability === "ready" ? null : NOTIFICATIONS_HELP[availability];
  return (
    <Surface className="surface-panel grid gap-3 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 id="notifications-title" className="type-heading">
          Notifications
        </h2>
        <Switch
          checked={on}
          onCheckedChange={change}
          disabled={availability !== "ready" || busy}
          aria-labelledby="notifications-title"
          aria-describedby="notifications-help"
        />
      </div>
      <p id="notifications-help" className="text-sm text-pretty text-fg-muted">
        {help ?? "Un rappel sur cet appareil 15 minutes avant chaque soirée prévue, puis à l'heure."}
      </p>
      {problem ? (
        <p role="alert" className="text-sm text-pretty text-danger">
          {problem}
        </p>
      ) : null}
    </Surface>
  );
}
