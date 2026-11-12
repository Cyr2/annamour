import type { CatalogTitle, PlayCatalogRequest } from "@annamour/protocol";
import { useId, useState } from "react";
import { Input } from "../../../ui/controls.tsx";
import { Field } from "../../../ui/Field.tsx";
import { ThreadSpinner } from "../../../ui/ThreadSpinner.tsx";
import { CatalogResults } from "./CatalogResults.tsx";
import { EpisodePicker } from "./EpisodePicker.tsx";
import { useCatalogSearch } from "./useCatalogSearch.ts";

interface CatalogPickerProps {
  /** A film, or the episode of a series, chosen by the person. */
  onPick: (play: PlayCatalogRequest) => void;
  /** An error from what happened after the pick (the import), shown under the results. */
  error: string | null;
  label?: string;
}

/** The poster goes along, so the séance can show it on « Ce soir ». */
/** What goes along with the title picked: its poster (for the séance's card) and TMDB's number (for its intro). */
const posterOf = (title: CatalogTitle) => ({
  ...(title.posterUrl ? { posterUrl: title.posterUrl } : {}),
  ...(title.tmdbId ? { tmdbId: title.tmdbId } : {}),
});

/** Type a title, pick it (and, for a series, its episode). Used to create a séance and to queue what follows. */
export function CatalogPicker({ onPick, error, label = "Titre" }: CatalogPickerProps) {
  const queryId = useId();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<CatalogTitle | null>(null);
  const search = useCatalogSearch(query);

  const pick = (title: CatalogTitle) => {
    if (title.type === "tv") setShow(title);
    else onPick({ id: title.id, type: "movie", title: title.title, ...posterOf(title) });
  };

  if (show) {
    return (
      <EpisodePicker
        show={show}
        onBack={() => setShow(null)}
        onPick={(season, episode) =>
          onPick({ id: show.id, type: "tv", title: show.title, season, episode, ...posterOf(show) })
        }
      />
    );
  }

  return (
    <div className="grid min-w-0 gap-4">
      <Field label={label} htmlFor={queryId}>
        <Input
          id={queryId}
          type="search"
          enterKeyHint="search"
          value={query}
          onValueChange={setQuery}
          placeholder="Interstellar, Euphoria…"
          autoComplete="off"
          maxLength={80}
          data-autofocus
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
    </div>
  );
}
