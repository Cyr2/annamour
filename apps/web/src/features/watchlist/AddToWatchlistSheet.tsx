import type { CatalogTitle } from "@annamour/protocol";
import { ChevronLeft, Heart, Plus } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { joinNames } from "../../lib/format.ts";
import { Button, Input } from "../../ui/controls.tsx";
import { Field } from "../../ui/Field.tsx";
import { Poster } from "../../ui/Poster.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { toast } from "../../ui/toast.ts";
import { CircleShareStep } from "../circles/CircleShareStep.tsx";
import { CatalogResults, describeTitle } from "../home/create/CatalogResults.tsx";
import { useCatalogSearch } from "../home/create/useCatalogSearch.ts";
import { rankPeople } from "../sessions/session-rules.ts";
import { useSessions } from "../sessions/sessions.ts";
import { useLoadSessions } from "../sessions/useLoadSessions.ts";
import { useCircleUi } from "../ui-version/ui-version.ts";
import { PersonFilter } from "./PersonFilter.tsx";
import { addTitle } from "./watchlist.ts";

/** « Ajouter à notre liste »: find a title, then pick who it is for (or, in the circles interface, which circle). */
export function AddToWatchlistSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState<CatalogTitle | null>(null);
  const circles = useCircleUi();
  const Share = circles ? CircleShareStep : ShareStep;
  const close = () => {
    setTitle(null);
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title={title ? "Ajouter à notre liste" : "Ajouter un titre"}>
      {title ? <Share title={title} onBack={() => setTitle(null)} onDone={close} /> : <SearchStep onPick={setTitle} />}
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

/** Who sees it: « Tout le monde » (no one picked) or the people picked among those I watched with. */
function ShareStep({ title, onBack, onDone }: { title: CatalogTitle; onBack: () => void; onDone: () => void }) {
  useLoadSessions();
  const sessions = useSessions((s) => s.sessions);
  const people = useMemo(() => rankPeople(sessions), [sessions]);
  const [picked, setPicked] = useState<string[]>([]);
  const [want, setWant] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = people.filter((p) => picked.includes(p.accountId)).map((p) => p.name);
  const toggle = (id: string | null) =>
    setPicked(id === null ? [] : picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await addTitle({ title, shareWith: picked.length ? picked : "everyone", want });
      toast({ message: `« ${title.title} » ajouté à la liste` });
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Ça n'a pas marché. Réessaie.");
      setBusy(false);
    }
  };

  return (
    <div className="grid min-w-0 gap-4">
      <div className="surface-tile flex items-center gap-3.5 p-2.5">
        <Poster title={title} />
        <span className="min-w-0">
          <span className="block truncate text-md font-semibold text-fg">{title.title}</span>
          <span className="block text-xs text-fg-muted">{describeTitle(title)}</span>
        </span>
      </div>
      <Field label="Avec qui ?">
        <PersonFilter people={people} selected={null} multiple={picked} onSelect={toggle} legend="Avec qui ?" />
      </Field>
      <p className="text-sm text-fg-muted">
        {people.length === 0
          ? "Tu le partageras avec les gens avec qui tu regardes des séances."
          : names.length > 1
            ? `${joinNames(names)} le verront dans leur liste, et pourront le lancer ou dire en avoir envie.`
            : `${names[0] ?? "Tout le monde"} le verra dans sa liste, et pourra le lancer ou dire en avoir envie.`}
      </p>
      <Button
        icon={<Heart className={want ? "fill-current text-accent" : undefined} />}
        aria-pressed={want}
        onClick={() => setWant(!want)}
      >
        J'en ai envie aussi
      </Button>
      <p role="alert" className="min-h-5 text-sm text-danger">
        {error ?? ""}
      </p>
      <Sheet.Actions>
        <Button icon={<ChevronLeft />} onClick={onBack}>
          Autre titre
        </Button>
        <Button variant="filled" icon={<Plus />} disabled={busy} onClick={() => void add()}>
          {busy ? "Un instant…" : names.length ? `Ajouter pour ${joinNames(names)}` : "Ajouter"}
        </Button>
      </Sheet.Actions>
    </div>
  );
}
