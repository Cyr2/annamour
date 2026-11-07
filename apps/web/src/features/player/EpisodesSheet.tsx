import type { RoomSnapshot } from "@annamour/protocol";
import { Check, Play, Plus, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { errorMessage } from "../../api/http.ts";
import { addEpisode } from "../../api/rooms.ts";
import type { SyncClient } from "../../sync/SyncClient.ts";
import { Button, Input } from "../../ui/controls.tsx";
import { cx } from "../../ui/cx.ts";
import { Field } from "../../ui/Field.tsx";
import { IconButton } from "../../ui/IconButton.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { ThreadSpinner } from "../../ui/ThreadSpinner.tsx";
import { useTv } from "../tv/tv-context.ts";
import { episodeName, episodeState, suggestedLabel } from "./episode-rules.ts";

interface EpisodesSheetProps {
  open: boolean;
  onClose: () => void;
  room: RoomSnapshot;
  client: SyncClient | null;
}

const STATE_TEXT = { watched: "Vu", current: "En cours", upcoming: "Ensuite" } as const;

/**
 * « Épisodes »: every episode of the séance, the watched ones ticked. Tapping
 * one takes everyone there (the next one, a later one, or one to watch again).
 * A phone or a computer also adds the next one; a TV only picks.
 */
export function EpisodesSheet({ open, onClose, room, client }: EpisodesSheetProps) {
  const tv = useTv();
  const play = (to: number) => {
    client?.send({ type: "playEpisode", from: room.current, to });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Épisodes">
      <Sheet.Lede>Choisis un épisode : il démarre pour tout le monde.</Sheet.Lede>
      <ol aria-label="Épisodes de la séance" className="grid max-h-[40dvh] gap-2 overflow-y-auto p-1">
        {room.episodes.map((_, index) => {
          const state = episodeState(index, room.current);
          const name = episodeName(room.episodes, index);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: an episode is its place in the séance.
            <li key={index} className="flex items-center gap-1">
              <button
                type="button"
                disabled={state === "current"}
                aria-current={state === "current" ? "true" : undefined}
                aria-label={state === "current" ? `${name}, en cours` : `Regarder ${name}, ${STATE_TEXT[state]}`}
                onClick={() => play(index)}
                className={cx(
                  "surface-tile flex min-h-14 flex-1 cursor-pointer items-center gap-3 px-3.5 py-2 text-left transition-colors",
                  "enabled:hover:bg-fill-hover disabled:cursor-default",
                )}
              >
                <EpisodeMark state={state} number={index + 1} />
                <span className="grid min-w-0 flex-1">
                  <b className="truncate text-sm font-semibold text-fg">{name}</b>
                  <small className="text-xs text-fg-muted">{STATE_TEXT[state]}</small>
                </span>
              </button>
              {state === "upcoming" ? (
                <IconButton
                  label={`Retirer ${name} de la suite`}
                  icon={<X />}
                  onClick={() => client?.send({ type: "removeEpisode", episode: index })}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {tv ? null : <AddEpisodeForm key={room.episodes.length} room={room} onDone={onClose} />}
    </Sheet>
  );
}

function EpisodeMark({ state, number }: { state: ReturnType<typeof episodeState>; number: number }) {
  return (
    <span
      aria-hidden
      className={cx(
        "grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold",
        state === "watched" ? "bg-success text-on-accent" : "bg-fill-strong text-fg",
      )}
    >
      {state === "watched" ? <Check className="size-4" strokeWidth={3} /> : null}
      {state === "current" ? <Play className="size-3.5 fill-current" /> : null}
      {state === "upcoming" ? number : null}
    </span>
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
