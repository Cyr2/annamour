import type { CatalogTitle, PlayCatalogRequest } from "@annamour/protocol";
import { useId, useState } from "react";
import { Button, Input } from "../../../ui/controls.tsx";
import { Field } from "../../../ui/Field.tsx";
import { Sheet } from "../../../ui/Sheet.tsx";
import { ThreadSpinner } from "../../../ui/ThreadSpinner.tsx";
import { CatalogResults } from "./CatalogResults.tsx";
import { EpisodePicker } from "./EpisodePicker.tsx";
import { useCatalogSearch } from "./useCatalogSearch.ts";

interface CatalogFormProps {
  error: string | null;
  onPlay: (play: PlayCatalogRequest) => void;
  onPasteLink: () => void;
  onCancel: () => void;
}

/** « Nouvelle séance » by name: type a title, pick it (and its episode), the séance is ready. */
export function CatalogForm({ error, onPlay, onPasteLink, onCancel }: CatalogFormProps) {
  const queryId = useId();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<CatalogTitle | null>(null);
  const search = useCatalogSearch(query);

  const pick = (title: CatalogTitle) => {
    if (title.type === "tv") setShow(title);
    else onPlay({ id: title.id, type: "movie", title: title.title });
  };

  if (show) {
    return (
      <EpisodePicker
        show={show}
        onBack={() => setShow(null)}
        onPick={(season, episode) => onPlay({ id: show.id, type: "tv", title: show.title, season, episode })}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <Sheet.Lede>Tape le nom d'un film ou d'une série. On s'occupe du reste.</Sheet.Lede>
      <Field label="Titre" htmlFor={queryId}>
        <Input
          id={queryId}
          type="search"
          enterKeyHint="search"
          value={query}
          onValueChange={setQuery}
          placeholder="Interstellar, Euphoria…"
          autoComplete="off"
          maxLength={80}
        />
      </Field>
      {search.status === "searching" ? (
        <div className="flex items-center gap-3 px-1 py-3 text-fg-muted" role="status">
          <ThreadSpinner />
          On cherche…
        </div>
      ) : null}
      {search.status === "done" ? <CatalogResults titles={search.titles} onPick={pick} /> : null}
      <p role="alert" className="min-h-5 text-sm text-danger">
        {error ?? (search.status === "error" ? search.message : "")}
      </p>
      <Sheet.Actions>
        <Button onClick={onCancel}>Annuler</Button>
        <Button onClick={onPasteLink}>Coller un lien</Button>
      </Sheet.Actions>
    </div>
  );
}
