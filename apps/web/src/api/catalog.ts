import {
  apiPath,
  CATALOG_API,
  type CatalogEpisode,
  CatalogSearchResponse,
  CatalogSeasonResponse,
  type CatalogTitle,
  CreateRoomResponse,
  type PlayCatalogRequest,
} from "@annamour/protocol";
import { request } from "./http.ts";

/* The catalog: find a film or a series by name, then start a séance on it. */

export async function searchCatalog(query: string, signal?: AbortSignal): Promise<CatalogTitle[]> {
  const path = `${CATALOG_API.search}?${new URLSearchParams({ q: query })}`;
  const { titles } = await request(CatalogSearchResponse, path, signal ? { signal } : {});
  return titles;
}

export async function fetchSeason(id: number, season: number, signal?: AbortSignal): Promise<CatalogEpisode[]> {
  const path = apiPath(CATALOG_API.season, { id: String(id), season: String(season) });
  const { episodes } = await request(CatalogSeasonResponse, path, signal ? { signal } : {});
  return episodes;
}

/** Gets the title's video on the server and imports it; returns the new séance's code. */
export async function playCatalog(play: PlayCatalogRequest): Promise<string> {
  const { code } = await request(CreateRoomResponse, CATALOG_API.play, { body: play });
  return code;
}
