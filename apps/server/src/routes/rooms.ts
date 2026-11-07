import {
  AddEpisodeRequest,
  type AddEpisodeResponse,
  CreateRoomRequest,
  type CreateRoomResponse,
  isRoomCode,
} from "@annamour/protocol";
import { Hono } from "hono";
import { UserFacingError } from "../errors.ts";
import { HlsError } from "../hls.ts";
import { type AppEnv, clientIp, type RouteDeps, readBody, sessionToken } from "../http/context.ts";
import { FetchError } from "../safe-fetch.ts";
import { RateLimiter } from "../services/rate-limiter.ts";

const CREATE_LIMIT = { windowMs: 60_000, max: 10 };
const IMPORT_HELP = "Colle un lien https vers une playlist .m3u8.";

/** What to tell the person when a link can't be imported; null for unexpected errors. */
function importErrorMessage(error: unknown): string | null {
  if (error instanceof HlsError) return "Ce lien ne mène pas à une vidéo lisible.";
  if (error instanceof FetchError) {
    // Signed CDN links answer 401/403 once their token has expired.
    const expired = error.status === 401 || error.status === 403;
    return expired ? "Ce lien a expiré : récupère-en un nouveau." : "Impossible d'ouvrir ce lien.";
  }
  return null;
}

export function roomRoutes({ services }: RouteDeps) {
  const { store, rooms, accounts, now } = services;
  // Creating a séance and adding an episode both import a stream: one budget for both.
  const imports = new RateLimiter(CREATE_LIMIT);
  const tooMany = { error: "Trop de liens importés, réessaie dans une minute." };
  const routes = new Hono<AppEnv>();

  routes.get("/api/health", (c) => c.json({ ok: true, rooms: store.size }));

  routes.post("/api/rooms", async (c) => {
    if (!imports.tryAcquire(clientIp(c), now())) return c.json(tooMany, 429);
    const request = await readBody(c, CreateRoomRequest, IMPORT_HELP);
    const creator = accounts.accountFor(sessionToken(c));
    const room = await importing(rooms.create(new URL(request.url), request.title, creator?.id));
    return c.json({ code: room.code } satisfies CreateRoomResponse, 201);
  });

  // Anyone with the code may queue the next episode, as anyone may join without an account.
  routes.post("/api/rooms/:code/episodes", async (c) => {
    const code = c.req.param("code");
    if (!isRoomCode(code)) return c.json({ error: "Cette séance n'existe plus." }, 404);
    if (!imports.tryAcquire(clientIp(c), now())) return c.json(tooMany, 429);
    const request = await readBody(c, AddEpisodeRequest, IMPORT_HELP);
    const episode = await importing(rooms.addEpisode(code, new URL(request.url), request.label));
    return c.json({ episode } satisfies AddEpisodeResponse, 201);
  });

  routes.get("/api/rooms/:code", (c) => {
    const code = c.req.param("code");
    const room = isRoomCode(code) ? store.get(code) : undefined;
    if (!room) return c.json({ error: "Cette séance n'existe plus." }, 404);
    return c.json(room.snapshot());
  });

  routes.get("/api/rooms/:code/e/:episode/hls/:file", (c) => {
    const playlist = episodeOf(c.req.param())?.imported.playlists.get(c.req.param("file"));
    if (!playlist) return c.notFound();
    return c.body(playlist, 200, {
      "content-type": "application/vnd.apple.mpegurl",
      "cache-control": "no-store",
    });
  });

  routes.get("/api/rooms/:code/e/:episode/subs/:file", (c) => {
    const vtt = episodeOf(c.req.param())?.imported.subtitleFiles.get(c.req.param("file").replace(/\.vtt$/, ""));
    if (!vtt) return c.notFound();
    return c.body(vtt, 200, { "content-type": "text/vtt; charset=utf-8", "cache-control": "private, max-age=86400" });
  });

  /** An episode's files, found by its id (stable, unlike its place in the queue). */
  function episodeOf({ code, episode }: { code: string; episode: string }) {
    return /^\d+$/.test(episode) ? store.get(code)?.episodeById(Number(episode)) : undefined;
  }

  return routes;
}

/** Waits for a stream import, turning the source's failures into a message for the person. */
async function importing<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    const message = importErrorMessage(error);
    if (message === null) throw error;
    throw new UserFacingError(message, 422);
  }
}
