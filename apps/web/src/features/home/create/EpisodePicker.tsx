import { CatalogLanguage, type CatalogSeasonResponse, type CatalogTitle, preferredLanguage } from "@annamour/protocol";
import { useEffect, useState } from "react";
import { fetchSeason } from "../../../api/catalog.ts";
import { errorMessage } from "../../../api/http.ts";
import { Button } from "../../../ui/controls.tsx";
import { Poster } from "../../../ui/Poster.tsx";
import { ThreadSpinner } from "../../../ui/ThreadSpinner.tsx";
import { describeTitle } from "./CatalogResults.tsx";
import { EpisodeList } from "./EpisodeList.tsx";

type SeasonState =
  | { status: "loading" }
  | ({ status: "done" } & CatalogSeasonResponse)
  | { status: "error"; message: string };

function useSeason(show: CatalogTitle, season: number): SeasonState {
  const [state, setState] = useState<SeasonState>({ status: "loading" });
  const { id, source, slug } = show;
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchSeason({ id, source, slug }, season, controller.signal).then(
      (answer) => setState({ status: "done", ...answer }),
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", message: errorMessage(error) });
      },
    );
    return () => controller.abort();
  }, [id, source, slug, season]);
  return state;
}

/** How many seasons to offer: Nakanime says so with the episodes, Naka with the title. */
function useSeasonCount(show: CatalogTitle, state: SeasonState): number {
  const [count, setCount] = useState(show.seasons ?? 1);
  const told = state.status === "done" ? state.seasons : undefined;
  useEffect(() => {
    if (told !== undefined) setCount(told);
  }, [told]);
  return count;
}

interface ChoiceProps<T extends string | number> {
  legend: string;
  options: readonly T[];
  label: (option: T) => string;
  value: T;
  onChange: (option: T) => void;
}

/** A row of buttons, one pressed: the season, or an anime's version. */
function Choice<T extends string | number>({ legend, options, label, value, onChange }: ChoiceProps<T>) {
  return (
    <fieldset className="-mx-1 flex min-w-0 gap-2 overflow-x-auto border-0 px-1 pb-1">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <Button
          key={option}
          aria-pressed={option === value}
          tone={option === value ? "accent" : "default"}
          onClick={() => onChange(option)}
        >
          {label(option)}
        </Button>
      ))}
    </fieldset>
  );
}

interface EpisodePickerProps {
  show: CatalogTitle;
  /** `language` is the anime's version (VF or VOSTFR); absent for Naka's series. */
  onPick: (season: number, episode: number, language: CatalogLanguage | undefined) => void;
  onBack: () => void;
}

/** A series: choose the season (and for an anime its version), then the episode to watch together. */
export function EpisodePicker({ show, onPick, onBack }: EpisodePickerProps) {
  const [season, setSeason] = useState(1);
  const anime = show.source === "nakanime";
  const [language, setLanguage] = useState(() => preferredLanguage(show.languages));
  const state = useSeason(show, season);
  const seasons = Array.from({ length: useSeasonCount(show, state) }, (_, i) => i + 1);

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Poster title={show} size="small" />
        <div className="min-w-0">
          <h3 className="truncate font-sans text-md font-semibold text-fg">{show.title}</h3>
          <p className="text-xs text-fg-muted">{describeTitle(show)}</p>
        </div>
      </div>
      {anime ? (
        <Choice
          legend="Version"
          options={CatalogLanguage.options}
          label={(l) => l}
          value={language}
          onChange={setLanguage}
        />
      ) : null}
      {seasons.length > 1 ? (
        <Choice legend="Saison" options={seasons} label={(n) => `Saison ${n}`} value={season} onChange={setSeason} />
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
      {state.status === "done" ? (
        <EpisodeList
          episodes={state.episodes}
          language={anime ? language : undefined}
          onPick={(episode, chosen) => onPick(season, episode, chosen)}
        />
      ) : null}
      <Button onClick={onBack}>Retour aux résultats</Button>
    </div>
  );
}
