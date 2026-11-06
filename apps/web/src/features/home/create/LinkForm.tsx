import { type FormEvent, useId, useState } from "react";
import { Button, Input } from "../../../ui/controls.tsx";
import { Field } from "../../../ui/Field.tsx";
import { Sheet } from "../../../ui/Sheet.tsx";

interface LinkFormProps {
  error: string | null;
  onSubmit: (url: string, title: string) => void;
  onCancel: () => void;
}

export function LinkForm({ error, onSubmit, onCancel }: LinkFormProps) {
  const linkId = useId();
  const titleId = useId();
  const errorId = useId();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(url, title);
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Sheet.Lede>Colle le lien de la vidéo. On s'occupe du reste.</Sheet.Lede>
      <Field label="Lien de la vidéo (.m3u8)" htmlFor={linkId}>
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
      <Field label="Nom de la séance" htmlFor={titleId}>
        <Input id={titleId} value={title} onValueChange={setTitle} placeholder="Film du vendredi…" maxLength={120} />
      </Field>
      <p id={errorId} role="alert" className="min-h-5 text-sm text-danger">
        {error ?? ""}
      </p>
      <Sheet.Actions>
        <Button onClick={onCancel}>Annuler</Button>
        <Button type="submit" variant="filled" disabled={!url.trim()}>
          Préparer la séance
        </Button>
      </Sheet.Actions>
    </form>
  );
}
