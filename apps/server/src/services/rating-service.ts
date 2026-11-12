import type { CatalogTitle, Rating, TitleRating } from "@annamour/protocol";
import { isCatalogPoster } from "../catalog/naka-catalog.ts";
import type { Repositories } from "../storage/repositories.ts";

/** Others see the title's poster: only one the catalog serves, never an address someone typed. */
function withTrustedPoster(title: CatalogTitle): CatalogTitle {
  if (title.posterUrl === undefined || isCatalogPoster(title.posterUrl)) return title;
  const { posterUrl: _untrusted, ...rest } = title;
  return rest;
}

export interface RatingServiceOptions {
  repositories: Pick<Repositories, "ratings">;
  now: () => number;
}

/** « Ton avis »: each person's word on a film or a series, seen by the people they watch with. */
export class RatingService {
  private readonly repositories: RatingServiceOptions["repositories"];
  private readonly now: () => number;

  constructor({ repositories, now }: RatingServiceOptions) {
    this.repositories = repositories;
    this.now = now;
  }

  list(accountId: string): TitleRating[] {
    return this.repositories.ratings.visibleTo(accountId);
  }

  rate(accountId: string, title: CatalogTitle, rating: Rating): void {
    this.repositories.ratings.rate(accountId, withTrustedPoster(title), rating, this.now());
  }

  unrate(accountId: string, type: CatalogTitle["type"], id: number): void {
    this.repositories.ratings.unrate(accountId, type, id);
  }
}
