import { type CatalogEpisode, type CatalogRef, catalogLabel, nextCatalogEpisode } from "@annamour/protocol";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchSeason } from "../../api/catalog.ts";

export interface Suggestion {
  next: CatalogRef;
  /** The episode's own title, when Naka gives it. */
  title: string | undefined;
}

/**
 * What follows `last` in its series, read from its season's episode list; null for a film or a link.
 * Keyed on plain values: the room snapshot is rebuilt on every play or pause, and each new
 * object must not ask Naka for the season again.
 */
export function useNextEpisode(last: CatalogRef | undefined): Suggestion | null {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const id = last?.id;
  const title = last?.title;
  const season = last?.type === "tv" ? last.season : undefined;
  const episode = last?.type === "tv" ? last.episode : undefined;
  const posterUrl = last?.posterUrl;
  const tmdbId = last?.tmdbId;

  useEffect(() => {
    setSuggestion(null);
    if (id === undefined || title === undefined || season === undefined || episode === undefined) return;
    const controller = new AbortController();
    // The series' poster goes along, for the séance's card once on this episode.
    const current: CatalogRef = {
      id,
      type: "tv",
      title,
      season,
      episode,
      ...(posterUrl ? { posterUrl } : {}),
      // TMDB's number goes along too: the next episode's intro and credits are then found without guessing.
      ...(tmdbId ? { tmdbId } : {}),
    };
    fetchSeason(id, season, controller.signal).then(
      (episodes: CatalogEpisode[]) => {
        const next = nextCatalogEpisode(
          current,
          episodes.map((e) => e.number),
        );
        if (!next) return;
        const name = next.season === season ? episodes.find((e) => e.number === next.episode)?.title : undefined;
        setSuggestion({ next, title: name });
      },
      // No suggestion when the season cannot be read: searching stays available below.
      () => undefined,
    );
    return () => controller.abort();
  }, [id, title, season, episode, posterUrl, tmdbId]);

  return suggestion;
}

interface NextEpisodeSuggestionProps {
  last: CatalogRef | undefined;
  disabled: boolean;
  onAdd: (next: CatalogRef) => void;
}

/** « Ajouter S1 · É2 — Comme papa »: one tap to queue the episode after the last one of a series. */
export function NextEpisodeSuggestion({ last, disabled, onAdd }: NextEpisodeSuggestionProps) {
  const suggestion = useNextEpisode(last);
  if (!suggestion) return null;
  const { next, title } = suggestion;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onAdd(next)}
      className="surface-tile flex min-h-14 w-full min-w-0 items-center gap-3 px-3.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
    >
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
        <Plus className="size-4" />
      </span>
      <span className="grid min-w-0 flex-1">
        <b className="truncate text-sm font-semibold text-fg">Épisode suivant · {catalogLabel(next)}</b>
        <small className="truncate text-xs text-fg-muted">{title ?? next.title}</small>
      </span>
    </button>
  );
}
