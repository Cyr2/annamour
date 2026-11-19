import type { CatalogTitle } from "@annamour/protocol";
import { formatDuration, plural } from "../../../lib/format.ts";
import { cx } from "../../../ui/cx.ts";
import { Poster } from "../../../ui/Poster.tsx";
import { sourceLabel, titleKey } from "./catalog-rules.ts";

/** « Film · 2014 · 2 h 49 », « Série · 2019 · 3 saisons ». */
export function describeTitle(title: CatalogTitle): string {
  return [title.type === "movie" ? "Film" : "Série", ...titleFacts(title)].join(" · ");
}

/** Its year and its length (or its seasons), the ones it has. */
export function titleFacts(title: CatalogTitle): string[] {
  const parts = [
    title.year ? String(title.year) : null,
    title.runtime ? formatDuration(title.runtime * 60) : null,
    title.seasons ? plural(title.seasons, "saison") : null,
  ];
  return parts.filter((part) => part !== null);
}

/** « Naka » or « Nakanime »: both answer the same search. */
function SourceBadge({ title }: { title: CatalogTitle }) {
  const anime = title.source === "nakanime";
  return (
    <span
      className={cx(
        "shrink-0 self-start rounded-full px-2 py-0.5 text-xs font-semibold",
        anime ? "bg-accent-soft text-accent" : "bg-fill-soft text-fg-muted",
      )}
    >
      {sourceLabel(title)}
    </span>
  );
}

interface CatalogResultsProps {
  titles: CatalogTitle[];
  onPick: (title: CatalogTitle) => void;
}

export function CatalogResults({ titles, onPick }: CatalogResultsProps) {
  if (titles.length === 0) {
    return <p className="px-1 py-3 text-sm text-fg-muted">Aucun titre trouvé. Essaie un autre mot du titre.</p>;
  }
  return (
    <ul
      className="-mx-1 grid max-h-[46dvh] grid-cols-[minmax(0,1fr)] gap-1 overflow-y-auto px-1"
      aria-label="Résultats"
    >
      {titles.map((title) => (
        <li key={titleKey(title)}>
          <button
            type="button"
            onClick={() => onPick(title)}
            className="surface-tile flex min-h-11 w-full items-center gap-3.5 p-2.5 text-left focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Poster title={title} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-sans text-md font-semibold text-fg">{title.title}</span>
              <span className="mt-0.5 block text-xs text-fg-muted">
                {[describeTitle(title), ...(title.languages ?? [])].join(" · ")}
              </span>
            </span>
            <SourceBadge title={title} />
          </button>
        </li>
      ))}
    </ul>
  );
}
