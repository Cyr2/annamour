import {
  apiPath,
  type CatalogTitle,
  RATINGS_API,
  type Rating,
  RatingsResponse,
  type TitleRating,
} from "@annamour/protocol";
import { z } from "zod/mini";
import { request } from "./http.ts";

/* « Ton avis » on films and series: mine and those of the people I watch with. */

/** Writes answer 204: there is nothing to read back. */
const Ignored = z.unknown();

export async function fetchRatings(): Promise<TitleRating[]> {
  const { ratings } = await request(RatingsResponse, RATINGS_API.list);
  return ratings;
}

export async function rateTitle(title: CatalogTitle, rating: Rating): Promise<void> {
  await request(Ignored, RATINGS_API.list, { method: "PUT", body: { title, rating } });
}

export async function unrateTitle(title: Pick<CatalogTitle, "type" | "id">): Promise<void> {
  await request(Ignored, apiPath(RATINGS_API.item, { type: title.type, id: String(title.id) }), {
    method: "DELETE",
  });
}
