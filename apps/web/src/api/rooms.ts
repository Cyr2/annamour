import {
  AddEpisodeRequest,
  AddEpisodeResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  PrepStatus,
  RoomSnapshot,
  SeanceReport,
} from "@annamour/protocol";
import { ApiRequestError, request } from "./http.ts";

/* Rooms: created from an HLS link, then looked up by their 4-letter code. */

const ROOM_GONE = "Aucune séance avec ce code. Vérifie les lettres avec la personne qui l'a créée.";

/** Imports the video behind `url` and returns the new room's code. */
export async function createRoom(url: string, title?: string): Promise<string> {
  const input = CreateRoomRequest.safeParse({ url: url.trim(), ...(title?.trim() ? { title: title.trim() } : {}) });
  if (!input.success) throw new ApiRequestError(400, "Colle un lien https vers une playlist .m3u8.");
  const { code } = await request(CreateRoomResponse, "/api/rooms", {
    body: input.data,
    messages: { 400: "Colle un lien https vers une playlist .m3u8." },
  });
  return code;
}

/** Imports the next episode of a séance and queues it for everyone in it; returns its index. */
export async function addEpisode(code: string, url: string, label: string): Promise<number> {
  const input = AddEpisodeRequest.safeParse({ url: url.trim(), ...(label.trim() ? { label: label.trim() } : {}) });
  if (!input.success) throw new ApiRequestError(400, "Colle un lien https vers une playlist .m3u8.");
  const { episode } = await request(AddEpisodeResponse, `/api/rooms/${encodeURIComponent(code)}/episodes`, {
    body: input.data,
    messages: { 400: "Colle un lien https vers une playlist .m3u8.", 404: ROOM_GONE },
  });
  return episode;
}

/** How ready the séance's lighter qualities are; asking also gets the server making them. */
export async function fetchPrep(code: string): Promise<PrepStatus> {
  return request(PrepStatus, `/api/rooms/${encodeURIComponent(code)}/prep`, { messages: { 404: ROOM_GONE } });
}

/** How the film played on each device of the séance, against the targets. */
export async function fetchSeanceReport(code: string): Promise<SeanceReport> {
  return request(SeanceReport, `/api/rooms/${encodeURIComponent(code)}/report`, { messages: { 404: ROOM_GONE } });
}

export async function fetchRoom(code: string): Promise<RoomSnapshot> {
  return request(RoomSnapshot, `/api/rooms/${encodeURIComponent(code)}`, { messages: { 404: ROOM_GONE } });
}
