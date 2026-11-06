import { CreateRoomRequest, CreateRoomResponse, RoomSnapshot } from "@annamour/protocol";
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

export async function fetchRoom(code: string): Promise<RoomSnapshot> {
  return request(RoomSnapshot, `/api/rooms/${encodeURIComponent(code)}`, { messages: { 404: ROOM_GONE } });
}
