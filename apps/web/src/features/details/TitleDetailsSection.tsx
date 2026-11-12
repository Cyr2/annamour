import type { CatalogTitle, TitleDetails } from "@annamour/protocol";
import { Clapperboard, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchTitleDetails } from "../../api/catalog.ts";
import { factsLine, OVERVIEW_FOLD, peopleLine, ratingLine } from "./details-rules.ts";

/** Details already read in this visit: opening a sheet again asks nothing. */
const known = new Map<string, TitleDetails | null>();
const keyOf = (title: CatalogTitle) => `${title.type}:${title.tmdbId ?? ""}:${title.title}:${title.year ?? ""}`;

/** Keyed on plain values: a sheet's title object is rebuilt on every render. */
function useTitleDetails({ id, type, title, year, tmdbId }: CatalogTitle): TitleDetails | null | undefined {
  const key = keyOf({ id, type, title, ...(year ? { year } : {}), ...(tmdbId ? { tmdbId } : {}) });
  const [details, setDetails] = useState(() => known.get(key));
  useEffect(() => {
    if (known.has(key)) return setDetails(known.get(key));
    const controller = new AbortController();
    const asked: CatalogTitle = { id, type, title, ...(year ? { year } : {}), ...(tmdbId ? { tmdbId } : {}) };
    fetchTitleDetails(asked, controller.signal).then(
      (found) => {
        known.set(key, found);
        setDetails(found);
      },
      () => setDetails(null),
    );
    return () => controller.abort();
  }, [key, id, type, title, year, tmdbId]);
  return details;
}

/**
 * What TMDB says of a title, in its sheet: the synopsis (folded when long), its
 * rating, genres and length, who made it and who plays in it, its trailer.
 * Nothing when TMDB does not know it; its room is kept while it loads.
 */
export function TitleDetailsSection({ title }: { title: CatalogTitle }) {
  const details = useTitleDetails(title);
  const [unfolded, setUnfolded] = useState(false);
  if (details === undefined)
    return <div aria-busy="true" className="min-h-24 animate-pulse rounded-control bg-fill-soft" />;
  if (details === null) return null;

  const rating = ratingLine(details);
  const facts = factsLine(details);
  const people = peopleLine(details);
  const long = (details.overview?.length ?? 0) > OVERVIEW_FOLD;
  return (
    <section aria-label={`À propos de « ${title.title} »`} className="grid gap-2 text-sm text-fg-muted">
      {rating ? (
        <p className="flex items-center gap-1.5 text-fg">
          <Star aria-hidden className="size-4 fill-current text-accent" />
          {rating}
        </p>
      ) : null}
      {facts ? <p>{facts}</p> : null}
      {details.overview ? (
        <p className={long && !unfolded ? "line-clamp-4 text-fg" : "text-fg"}>{details.overview}</p>
      ) : null}
      {long ? (
        <button
          type="button"
          onClick={() => setUnfolded(!unfolded)}
          aria-expanded={unfolded}
          className="min-h-11 justify-self-start font-semibold text-accent"
        >
          {unfolded ? "Replier" : "Lire la suite"}
        </button>
      ) : null}
      {people ? <p>{people}</p> : null}
      {details.trailerUrl ? (
        <a
          href={details.trailerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-2 justify-self-start font-semibold text-accent"
        >
          <Clapperboard aria-hidden className="size-4" />
          Bande-annonce
        </a>
      ) : null}
      <p className="text-xs text-fg-subtle">
        Infos{" "}
        <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="underline">
          TMDB
        </a>
      </p>
    </section>
  );
}
