import type { CatalogTitle } from "@annamour/protocol";
import { useId, useState } from "react";
import { Input } from "../../ui/controls.tsx";
import { Field } from "../../ui/Field.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { CircleShareStep } from "../circles/CircleShareStep.tsx";
import { CatalogResults } from "../home/create/CatalogResults.tsx";
import { useCatalogSearch } from "../home/create/useCatalogSearch.ts";

/** « Ajouter à notre liste »: find a title, then the circle it goes to. */
export function AddToWatchlistSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState<CatalogTitle | null>(null);
  const close = () => {
    setTitle(null);
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title={title ? "Ajouter à notre liste" : "Ajouter un titre"}>
      {title ? (
        <CircleShareStep title={title} onBack={() => setTitle(null)} onDone={close} />
      ) : (
        <SearchStep onPick={setTitle} />
      )}
    </Sheet>
  );
}

function SearchStep({ onPick }: { onPick: (title: CatalogTitle) => void }) {
  const queryId = useId();
  const [query, setQuery] = useState("");
  const search = useCatalogSearch(query);
  return (
    <div className="grid min-w-0 gap-4">
      <Field label="Chercher un film ou une série" htmlFor={queryId}>
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
      {search.status === "done" ? <CatalogResults titles={search.titles} onPick={onPick} /> : null}
      <p role="alert" className="min-h-5 text-sm text-danger">
        {search.status === "error" ? search.message : ""}
      </p>
    </div>
  );
}
