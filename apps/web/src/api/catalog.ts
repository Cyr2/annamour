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
export async function playCatalog(play: PlayCatalogRequest): Promise<string> {
  const { code } = await request(CreateRoomResponse, CATALOG_API.play, { body: play });
  return code;
}
