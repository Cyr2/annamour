import type { CatalogTitle, TitleDetails } from "@annamour/protocol";
import { ChevronDown, Clapperboard, Star } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { fetchTitleDetails } from "../../api/catalog.ts";
import { cx } from "../../ui/cx.ts";
import { factsLine, peopleLine, ratingLine, shortRating } from "./details-rules.ts";

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
 * What TMDB says of a title, kept short in its sheet: one line (rating, genres,
 * length), then « Détails » unfolds the synopsis, who made it and plays in it,
 * and the trailer. Nothing when TMDB does not know it.
 */
export function TitleDetailsSection({ title }: { title: CatalogTitle }) {
  const details = useTitleDetails(title);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  // Its one line's room is kept while it loads: the sheet does not jump.
  if (details === undefined) return <p aria-busy="true" className="min-h-11" />;
  if (details === null) return null;

  const rating = shortRating(details);
  const facts = factsLine(details);
  const people = peopleLine(details);
  const hasMore = Boolean(details.overview || people || details.trailerUrl);
  return (
    <section aria-label={`À propos de « ${title.title} »`} className="grid gap-1 text-sm text-fg-muted">
      <div className="flex min-h-11 items-center gap-3">
        <p className="flex min-w-0 flex-1 items-center gap-1.5">
          {rating ? (
            <>
              <Star aria-hidden className="size-4 shrink-0 fill-current text-accent" />
              <span className="font-semibold text-fg">{rating}</span>
              <span className="sr-only"> sur 10</span>
              {facts ? <span aria-hidden>·</span> : null}
            </>
          ) : null}
          <span className="truncate">{facts}</span>
        </p>
        {hasMore ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex min-h-11 shrink-0 items-center gap-1 font-semibold text-accent"
          >
            Détails
            <ChevronDown aria-hidden className={cx("size-4 transition-transform", open && "rotate-180")} />
          </button>
        ) : null}
      </div>
      {open ? <DetailsPanel id={panelId} details={details} people={people} /> : null}
    </section>
  );
}

function DetailsPanel({ id, details, people }: { id: string; details: TitleDetails; people: string }) {
  const votes = ratingLine(details);
  return (
    <div id={id} className="grid gap-2 pb-1">
      {details.overview ? <p className="text-fg">{details.overview}</p> : null}
      {people ? <p>{people}</p> : null}
      {votes ? <p>Note TMDB&nbsp;: {votes}</p> : null}
      {details.trailerUrl ? (
        <a
          href={details.trailerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-2 justify-self-start font-semibold text-accent"
        >
          <Clapperboard aria-hidden className="size-4" />
          Bande-annonce
          <span className="sr-only"> (nouvel onglet)</span>
        </a>
      ) : null}
    </div>
  );
}
