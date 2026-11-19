import { type FormEvent, useId, useState } from "react";
import { Button, Input } from "../../../ui/controls.tsx";
import { Field } from "../../../ui/Field.tsx";
import { Sheet } from "../../../ui/Sheet.tsx";
import { type LinkKind, linkProblem } from "./link-rules.ts";

interface LinkFormProps {
  /** « Coller un lien » (a playlist, or YouTube too) or « YouTube » (a video or a live stream). */
  kind: LinkKind;
  error: string | null;
  onSubmit: (url: string, title: string) => void;
  onCancel: () => void;
}

const WORDS: Record<LinkKind, { lede: string; label: string; placeholder: string }> = {
  m3u8: {
    lede: "Colle le lien de la vidéo. On s'occupe du reste.",
    label: "Lien de la vidéo (.m3u8 ou YouTube)",
    placeholder: "https://…/master.m3u8",
  },
  youtube: {
    lede: "Colle le lien d'une vidéo ou d'un direct YouTube. Les pubs de YouTube restent.",
    label: "Lien YouTube (vidéo ou direct)",
    placeholder: "https://youtube.com/watch?v=…",
  },
};

export function LinkForm({ kind, error, onSubmit, onCancel }: LinkFormProps) {
  const linkId = useId();
  const titleId = useId();
  const errorId = useId();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const words = WORDS[kind];
  const shown = problem ?? error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = linkProblem(kind, url);
    setProblem(found);
    if (!found) onSubmit(url, title);
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Sheet.Lede>{words.lede}</Sheet.Lede>
      <Field label={words.label} htmlFor={linkId}>
        <Input
          id={linkId}
          type="url"
          inputMode="url"
          value={url}
          onValueChange={setUrl}
          placeholder={words.placeholder}
          autoComplete="off"
          spellCheck={false}
          required
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? errorId : undefined}
          className="font-mono [&_input]:text-xs"
        />
      </Field>
      {/* A YouTube séance takes the video's own title. */}
      {kind === "youtube" ? null : (
        <Field label="Nom de la séance" htmlFor={titleId}>
          <Input id={titleId} value={title} onValueChange={setTitle} placeholder="Film du vendredi…" maxLength={120} />
        </Field>
      )}
      <p id={errorId} role="alert" className="min-h-5 text-sm text-danger">
        {shown ?? ""}
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
