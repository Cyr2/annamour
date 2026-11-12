import {
  type AddCatalogEpisodeRequest,
  AddEpisodeResponse,
  apiPath,
  CATALOG_API,
  type CatalogEpisode,
  CatalogSearchResponse,
  CatalogSeasonResponse,
  type CatalogTitle,
  CreateRoomResponse,
  type PlayCatalogRequest,
  type TitleDetails,
  TitleDetailsResponse,
} from "@annamour/protocol";
import { request } from "./http.ts";
import { inCircle } from "./rooms.ts";

/* The catalog: find a film or a series by name, then start a séance on it. */

export async function searchCatalog(query: string, signal?: AbortSignal): Promise<CatalogTitle[]> {
  const path = `${CATALOG_API.search}?${new URLSearchParams({ q: query })}`;
  const { titles } = await request(CatalogSearchResponse, path, signal ? { signal } : {});
  return titles;
}

/** What TMDB says of a title (synopsis, rating, people…), or null when nothing is known. */
export async function fetchTitleDetails(title: CatalogTitle, signal?: AbortSignal): Promise<TitleDetails | null> {
  const query = new URLSearchParams({ type: title.type, title: title.title });
  if (title.year !== undefined) query.set("year", String(title.year));
  if (title.tmdbId !== undefined) query.set("tmdbId", String(title.tmdbId));
  const { details } = await request(TitleDetailsResponse, `${CATALOG_API.details}?${query}`, signal ? { signal } : {});
  return details;
}

export async function fetchSeason(id: number, season: number, signal?: AbortSignal): Promise<CatalogEpisode[]> {
  const path = apiPath(CATALOG_API.season, { id: String(id), season: String(season) });
  const { episodes } = await request(CatalogSeasonResponse, path, signal ? { signal } : {});
  return episodes;
}

/** Queues a catalog title after a séance's episodes; returns its index in the queue. */
export async function addCatalogEpisode(code: string, play: AddCatalogEpisodeRequest): Promise<number> {
  const path = apiPath(CATALOG_API.addEpisode, { code });
  const { episode } = await request(AddEpisodeResponse, path, {
    body: play,
    messages: { 404: "Cette séance n'existe plus, ou ce titre n'a pas encore de vidéo." },
  });
  return episode;
}

/** Gets the title's video on the server and imports it; returns the new séance's code. */
export async function playCatalog(play: PlayCatalogRequest, circleId?: string | null): Promise<string> {
  const { code } = await request(CreateRoomResponse, inCircle(CATALOG_API.play, circleId), { body: play });
  return code;
}
