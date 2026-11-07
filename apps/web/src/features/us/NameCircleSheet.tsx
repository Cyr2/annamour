import type { Circle } from "@annamour/protocol";
import { type FormEvent, useId, useState } from "react";
import { Button, Input } from "../../ui/controls.tsx";
import { Field } from "../../ui/Field.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { toast } from "../../ui/toast.ts";
import { createCircle, renameCircle } from "../circles/circles.ts";

interface NameCircleSheetProps {
  open: boolean;
  onClose: () => void;
  /** The circle to rename; absent to create a new one. */
  circle?: Circle;
}

/** « Renommer » a circle, or « Créer un cercle »: one name, then invite people from its card. */
export function NameCircleSheet({ open, onClose, circle }: NameCircleSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={circle ? "Renommer le cercle" : "Créer un cercle"}>
      {open ? <NameForm circle={circle} onDone={onClose} /> : null}
    </Sheet>
  );
}

function NameForm({ circle, onDone }: { circle: Circle | undefined; onDone: () => void }) {
  const nameId = useId();
  const [name, setName] = useState(circle?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError("Donne un nom au cercle.");
    setBusy(true);
    setError(null);
    try {
      if (circle) await renameCircle(circle.id, name);
      else await createCircle(name);
      toast({ message: circle ? "Cercle renommé" : "Cercle créé : invite qui tu veux depuis sa carte" });
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Ça n'a pas marché. Réessaie.");
      setBusy(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {circle ? null : <Sheet.Lede>Un groupe avec qui regarder : les potes du jeudi, la famille…</Sheet.Lede>}
      <Field label="Nom du cercle" htmlFor={nameId}>
        <Input id={nameId} value={name} onValueChange={setName} maxLength={40} placeholder="Les potes du jeudi" />
      </Field>
      <p role="alert" className="min-h-5 text-sm text-danger">
        {error ?? ""}
      </p>
      <Sheet.Actions>
        <Button type="submit" variant="filled" disabled={busy}>
          {busy ? "Un instant…" : circle ? "Renommer" : "Créer le cercle"}
        </Button>
      </Sheet.Actions>
    </form>
  );
}
