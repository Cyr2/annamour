import type { CatalogEpisode, CatalogTitle } from "@annamour/protocol";
import { useEffect, useState } from "react";
import { fetchSeason } from "../../../api/catalog.ts";
import { errorMessage } from "../../../api/http.ts";
import { Button } from "../../../ui/controls.tsx";
import { Poster } from "../../../ui/Poster.tsx";
import { ThreadSpinner } from "../../../ui/ThreadSpinner.tsx";
import { describeTitle } from "./CatalogResults.tsx";

type SeasonState =
  | { status: "loading" }
  | { status: "done"; episodes: CatalogEpisode[] }
  | { status: "error"; message: string };

function useSeason(id: number, season: number): SeasonState {
  const [state, setState] = useState<SeasonState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchSeason(id, season, controller.signal).then(
      (episodes) => setState({ status: "done", episodes }),
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", message: errorMessage(error) });
      },
    );
    return () => controller.abort();
  }, [id, season]);
  return state;
}

interface EpisodePickerProps {
  show: CatalogTitle;
  onPick: (season: number, episode: number) => void;
  onBack: () => void;
}

/** A series: choose the season, then the episode to watch together. */
export function EpisodePicker({ show, onPick, onBack }: EpisodePickerProps) {
  const [season, setSeason] = useState(1);
  const state = useSeason(show.id, season);
  const seasons = Array.from({ length: show.seasons ?? 1 }, (_, i) => i + 1);

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Poster title={show} size="small" />
        <div className="min-w-0">
          <h3 className="truncate font-sans text-md font-semibold text-fg">{show.title}</h3>
          <p className="text-xs text-fg-muted">{describeTitle(show)}</p>
        </div>
      </div>
      {seasons.length > 1 ? (
        <fieldset className="-mx-1 flex min-w-0 gap-2 overflow-x-auto border-0 px-1 pb-1">
          <legend className="sr-only">Saison</legend>
          {seasons.map((n) => (
            <Button
              key={n}
              aria-pressed={n === season}
              tone={n === season ? "accent" : "default"}
              onClick={() => setSeason(n)}
            >
              Saison {n}
            </Button>
          ))}
        </fieldset>
      ) : null}
      {state.status === "loading" ? (
        <div className="flex items-center gap-3 px-1 py-3 text-fg-muted" role="status">
          <ThreadSpinner />
          On cherche les épisodes…
        </div>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}
      {state.status === "done" ? <EpisodeList episodes={state.episodes} onPick={(e) => onPick(season, e)} /> : null}
      <Button onClick={onBack}>Retour aux résultats</Button>
    </div>
  );
}

function EpisodeList({ episodes, onPick }: { episodes: CatalogEpisode[]; onPick: (episode: number) => void }) {
  if (episodes.length === 0)
    return <p className="px-1 text-sm text-fg-muted">Pas encore d'épisode pour cette saison.</p>;
  return (
    <ul className="-mx-1 grid max-h-[36dvh] grid-cols-[minmax(0,1fr)] gap-1 overflow-y-auto px-1" aria-label="Épisodes">
      {episodes.map(({ number, title }) => (
        <li key={number}>
          <button
            type="button"
            onClick={() => onPick(number)}
            className="surface-tile flex min-h-11 w-full items-baseline gap-3 px-3.5 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="w-7 shrink-0 font-mono text-sm text-fg-muted">É{number}</span>
            <span className="min-w-0 truncate text-sm text-fg">{title ?? `Épisode ${number}`}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
