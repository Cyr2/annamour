import {
  type CatalogEpisode,
  type CatalogLanguage,
  type CatalogTitle,
  type PlayCatalogRequest,
  preferredLanguage,
} from "@annamour/protocol";

/* Naka and Nakanime answer the same search: what tells their titles apart, and what goes along with a pick. */

/** « Naka » or « Nakanime »: where a title comes from (Naka for titles kept from before). */
export function sourceLabel(title: Pick<CatalogTitle, "source">): string {
  return title.source === "nakanime" ? "Nakanime" : "Naka";
}

/** Unique across both sources: the same id can name two titles, one on each. */
export function titleKey(title: CatalogTitle): string {
  return `${title.source ?? "naka"}-${title.type}-${title.id}`;
}

/**
 * What goes along with the title picked: its poster (for the séance's card),
 * TMDB's number (for its intro), and for an anime its page name.
 */
export function pickedTitle(title: CatalogTitle): Omit<PlayCatalogRequest, "type" | "season" | "episode"> {
  return {
    id: title.id,
    title: title.title,
    ...(title.posterUrl ? { posterUrl: title.posterUrl } : {}),
    ...(title.tmdbId ? { tmdbId: title.tmdbId } : {}),
    ...(title.source === "nakanime" ? { source: title.source, ...(title.slug ? { slug: title.slug } : {}) } : {}),
  };
}

/** A Nakanime film plays in VF when it has it; Naka's titles have no version to choose. */
export function filmRequest(title: CatalogTitle): PlayCatalogRequest {
  const language = title.source === "nakanime" ? { language: preferredLanguage(title.languages) } : {};
  return { ...pickedTitle(title), type: "movie", ...language };
}

/** One episode of a series, in the version chosen for an anime. */
export function episodeRequest(
  show: CatalogTitle,
  { season, episode, language }: { season: number; episode: number; language?: CatalogLanguage | undefined },
): PlayCatalogRequest {
  return { ...pickedTitle(show), type: "tv", season, episode, ...(language ? { language } : {}) };
}

/** The version an episode plays in: the one chosen when it has it, else the one it has. */
export function episodeLanguage(episode: CatalogEpisode, chosen: CatalogLanguage): CatalogLanguage {
  const available = episode.languages ?? [];
  return available.length === 0 || available.includes(chosen) ? chosen : preferredLanguage(available);
}
