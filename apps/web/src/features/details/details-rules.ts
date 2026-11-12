import type { TitleDetails } from "@annamour/protocol";
import { joinNames } from "../../lib/format.ts";

/* How a title's sheet tells what TMDB says of it, in French. */

/** A synopsis longer than this is folded behind « Lire la suite ». */
export const OVERVIEW_FOLD = 240;

/** « 7,9 sur 10 · 19 000 votes »; nothing before a title has a few votes. */
export function ratingLine({ voteAverage, voteCount }: TitleDetails): string {
  if (voteAverage === undefined || !voteCount || voteCount < 10) return "";
  const average = voteAverage.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const votes = voteCount.toLocaleString("fr-FR");
  return `${average} sur 10 · ${votes} vote${voteCount > 1 ? "s" : ""}`;
}

/** « 2 h 29 », « 45 min ». */
export function runtimeLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${String(rest).padStart(2, "0")}` : ""}`;
}

/** « Drame, thriller · 2 h 29 », « Drame · 3 saisons ». */
export function factsLine(details: TitleDetails): string {
  const genres = details.genres.slice(0, 3).join(", ");
  const length = details.runtime
    ? runtimeLabel(details.runtime)
    : details.seasons
      ? `${details.seasons} saison${details.seasons > 1 ? "s" : ""}`
      : "";
  return [genres.charAt(0).toLocaleUpperCase("fr") + genres.slice(1), length].filter(Boolean).join(" · ");
}

/** « De David Fincher · Avec Ben Affleck, Rosamund Pike et Neil Patrick Harris ». */
export function peopleLine({ directors, cast }: TitleDetails): string {
  return [directors.length ? `De ${joinNames(directors)}` : "", cast.length ? `Avec ${joinNames(cast)}` : ""]
    .filter(Boolean)
    .join(" · ");
}
