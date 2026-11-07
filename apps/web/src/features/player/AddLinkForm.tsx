import type { RoomSnapshot } from "@annamour/protocol";
import { Plus } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Button, Input } from "../../ui/controls.tsx";
import { Field } from "../../ui/Field.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { suggestedLabel } from "./episode-rules.ts";

interface AddLinkFormProps {
  room: RoomSnapshot;
  busy: boolean;
  error: string | null;
  onSubmit: (url: string, label: string) => void;
  onSearch: () => void;
}

/** The next episode from a pasted .m3u8 link, starting from a guessed label (« É5 » → « É6 »). */
export function AddLinkForm({ room, busy, error, onSubmit, onSearch }: AddLinkFormProps) {
  const linkId = useId();
  const labelId = useId();
  const errorId = useId();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState(() => suggestedLabel(room.episodes));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(url, label);
  };

  return (
    <form className="grid min-w-0 gap-4" onSubmit={submit}>
      <Field label="Lien de l'épisode d'après (.m3u8)" htmlFor={linkId}>
        <Input
          id={linkId}
          type="url"
          inputMode="url"
          value={url}
          onValueChange={setUrl}
          placeholder="https://…/master.m3u8"
          autoComplete="off"
          spellCheck={false}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="font-mono [&_input]:text-xs"
        />
      </Field>
      <Field label="Titre" htmlFor={labelId}>
        <Input id={labelId} value={label} onValueChange={setLabel} maxLength={40} />
      </Field>
      <p id={errorId} role="alert" className="min-h-5 text-sm text-danger">
        {error ?? ""}
      </p>
      <Sheet.Actions>
        <Button onClick={onSearch}>Chercher un titre</Button>
        <Button type="submit" variant="filled" icon={<Plus />} disabled={busy || !url.trim()}>
          Ajouter à la suite
        </Button>
      </Sheet.Actions>
    </form>
  );
}
