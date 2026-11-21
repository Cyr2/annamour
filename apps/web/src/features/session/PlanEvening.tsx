import { plannedLabel, type SessionSummary } from "@annamour/protocol";
import { CalendarClock } from "lucide-react";
import { useId, useState } from "react";
import { errorMessage } from "../../api/http.ts";
import { cancelPlan, planSeance } from "../../api/push.ts";
import { Button, Input } from "../../ui/controls.tsx";
import { Field } from "../../ui/Field.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { toast } from "../../ui/toast.ts";
import { reloadSessions } from "../sessions/sessions.ts";
import { fromPickerValue, initialPlanTime, toPickerValue } from "./plan-rules.ts";

/**
 * « Prévoir la soirée » in the salon: a day and a time everyone of the séance
 * sees on it, with a reminder before. Shown only to someone with an account in it.
 */
export function PlanEvening({ seance }: { seance: SessionSummary }) {
  const [open, setOpen] = useState(false);
  const label = seance.plannedAt === undefined ? null : plannedLabel(seance.plannedAt, Date.now());
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
      >
        <CalendarClock aria-hidden className="size-4" />
        {label ? (
          <span>
            <span className="font-semibold text-accent">{label}</span> · Modifier
          </span>
        ) : (
          "Prévoir la soirée"
        )}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Prévoir la soirée">
        {open ? <PlanForm seance={seance} onDone={() => setOpen(false)} /> : null}
      </Sheet>
    </>
  );
}

function PlanForm({ seance, onDone }: { seance: SessionSummary; onDone: () => void }) {
  const inputId = useId();
  const [value, setValue] = useState(() => toPickerValue(initialPlanTime(seance.plannedAt, Date.now())));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const at = fromPickerValue(value);

  const run = (work: Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    void work
      .then(() => reloadSessions())
      .then(() => {
        toast({ message: done });
        onDone();
      })
      .catch((failure: unknown) => setError(errorMessage(failure)))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <Sheet.Lede>
        Tout le monde de la séance voit l'heure et reçoit un rappel 15 minutes avant, puis à l'heure (notifications à
        activer dans le Profil).
      </Sheet.Lede>
      <Field label="Jour et heure" htmlFor={inputId}>
        <Input id={inputId} type="datetime-local" value={value} onValueChange={setValue} required />
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Sheet.Actions>
        {seance.plannedAt === undefined ? null : (
          <Button disabled={busy} onClick={() => run(cancelPlan(seance.code), "Soirée prévue annulée")}>
            Annuler la soirée prévue
          </Button>
        )}
        <Button
          variant="filled"
          disabled={busy || at === null}
          onClick={() =>
            at !== null && run(planSeance(seance.code, at), `Soirée prévue : ${plannedLabel(at, Date.now())}`)
          }
        >
          {busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </Sheet.Actions>
    </>
  );
}
