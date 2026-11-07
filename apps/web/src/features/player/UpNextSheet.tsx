import type { RoomSnapshot } from "@annamour/protocol";
import { Play, Plus, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { errorMessage } from "../../api/http.ts";
import { addEpisode } from "../../api/rooms.ts";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { Button, Input } from "../../ui/controls.tsx";
import { Field } from "../../ui/Field.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { episodeName, suggestedLabel } from "./episode-rules.ts";

interface UpNextSheetProps {
  open: boolean;
  onClose: () => void;
  room: RoomSnapshot;
  client: SyncClient | null;
}

/** « À suivre »: the episode on screen, the ones queued after it, and a link to add the next. */
export function UpNextSheet({ open, onClose, room, client }: UpNextSheetProps) {
  const upcoming = room.episodes.map((_, index) => index).filter((index) => index >= room.current);
  return (
    <Sheet open={open} onClose={onClose} title="À suivre">
      <Sheet.Lede>À la fin de l'épisode, la suite démarre pour tout le monde.</Sheet.Lede>
      <ol aria-label="Épisodes à suivre" className="grid gap-2">
        {upcoming.map((index) => (
          <li key={index} className="surface-tile flex min-h-14 items-center gap-3 px-3.5 py-2">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-fill-strong text-xs font-bold text-fg"
            >
              {index === room.current ? <Play className="size-3.5 fill-current" /> : index - room.current + 1}
            </span>
            <span className="grid min-w-0 flex-1">
              <b className="truncate text-sm font-semibold text-fg">{episodeName(room.episodes, index)}</b>
              <small className="text-xs text-fg-muted">{index === room.current ? "En cours" : "Ensuite"}</small>
            </span>
            {index > room.current ? (
              <IconButton
                label={`Retirer ${episodeName(room.episodes, index)} de la suite`}
                icon={<X />}
                onClick={() => client?.send({ type: "removeEpisode", episode: index })}
              />
            ) : null}
          </li>
        ))}
      </ol>
      <AddEpisodeForm key={room.episodes.length} room={room} onDone={onClose} />
    </Sheet>
  );
}

/** Starts from a guessed label (« É5 » → « É6 »); remounted after each add, so the next guess comes in. */
function AddEpisodeForm({ room, onDone }: { room: RoomSnapshot; onDone: () => void }) {
  const linkId = useId();
  const labelId = useId();
  const errorId = useId();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState(() => suggestedLabel(room.episodes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addEpisode(room.code, url, label);
      onDone();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={submit}>
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
        {busy ? (
          <span className="flex items-center gap-3 text-fg-muted">
            <ThreadSpinner /> On récupère l'épisode…
          </span>
        ) : (
          (error ?? "")
        )}
      </p>
      <Sheet.Actions>
        <Button type="submit" variant="filled" icon={<Plus />} disabled={busy || !url.trim()}>
          Ajouter à la suite
        </Button>
      </Sheet.Actions>
    </form>
  );
}
