import { createApp } from "../src/app.ts";
import type { ImportedMedia } from "../src/hls.ts";
import { RoomStore, type RoomStoreOptions } from "../src/room-store.ts";
import { createServices, type ServiceOptions } from "../src/services/services.ts";
import { openDatabase } from "../src/storage/database.ts";
import { RoomRepository } from "../src/storage/room-repository.ts";

export const RELYING_PARTY = { id: "localhost", name: "Annamour", origins: ["http://localhost:5173"] };
export const TEST_PEPPER = "test-pepper";

export const media: ImportedMedia = {
  playlists: new Map([["master.m3u8", "#EXTM3U"]]),
  audio: [],
  subtitles: [],
  subtitleFiles: new Map(),
  duration: 100,
};

/** Services over a fresh in-memory database. */
export function testServices(overrides: Partial<ServiceOptions> = {}) {
  return createServices({
    db: openDatabase(":memory:"),
    pepper: TEST_PEPPER,
    relyingParty: RELYING_PARTY,
    ...overrides,
  });
}

export function testApp(overrides: Partial<ServiceOptions> = {}) {
  const services = testServices(overrides);
  return { services, app: createApp(services) };
}

export function testStore(options: RoomStoreOptions = {}) {
  const repository = new RoomRepository(openDatabase(":memory:"));
  return { repository, store: new RoomStore(repository, options) };
}

export function jsonRequest(method: string, body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

/** The session cookie a response set, ready to send back. */
export function sessionCookieOf(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  return header.split(";")[0] ?? "";
}
