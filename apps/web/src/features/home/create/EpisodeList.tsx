import type { CatalogEpisode, CatalogLanguage } from "@annamour/protocol";
import { episodeLanguage } from "./catalog-rules.ts";

interface EpisodeListProps {
  episodes: CatalogEpisode[];
  /** An anime's version chosen above; absent for Naka's series. */
  language: CatalogLanguage | undefined;
  onPick: (episode: number, language: CatalogLanguage | undefined) => void;
}

/** What an episode says besides its title: filler, or that it only has the other version. */
function episodeNotes(episode: CatalogEpisode, language: CatalogLanguage | undefined): string[] {
  const notes = episode.filler ? ["hors-série"] : [];
  if (language && episodeLanguage(episode, language) !== language) {
    notes.push(`${episodeLanguage(episode, language)} seulement`);
  }
  return notes;
}

export function EpisodeList({ episodes, language, onPick }: EpisodeListProps) {
  if (episodes.length === 0)
    return <p className="px-1 text-sm text-fg-muted">Pas encore d'épisode pour cette saison.</p>;
  return (
    <ul className="-mx-1 grid max-h-[36dvh] grid-cols-[minmax(0,1fr)] gap-1 overflow-y-auto px-1" aria-label="Épisodes">
      {episodes.map((episode) => {
        const notes = episodeNotes(episode, language);
        return (
          <li key={episode.number}>
            <button
              type="button"
              onClick={() => onPick(episode.number, language && episodeLanguage(episode, language))}
              className="surface-tile flex min-h-11 w-full items-baseline gap-3 px-3.5 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="w-9 shrink-0 font-mono text-sm text-fg-muted">É{episode.number}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-fg">
                {episode.title ?? `Épisode ${episode.number}`}
              </span>
              {notes.length > 0 ? <span className="shrink-0 text-xs text-fg-muted">{notes.join(" · ")}</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
