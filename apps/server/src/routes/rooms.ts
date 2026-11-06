import { CreateRoomRequest, type CreateRoomResponse, isRoomCode } from "@annamour/protocol";
import { Hono } from "hono";
import { UserFacingError } from "../errors.ts";
import { HlsError } from "../hls.ts";
import { type AppEnv, clientIp, type RouteDeps, readBody, sessionToken } from "../http/context.ts";
import { FetchError } from "../safe-fetch.ts";
import { RateLimiter } from "../services/rate-limiter.ts";

const CREATE_LIMIT = { windowMs: 60_000, max: 10 };

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
  const creations = new RateLimiter(CREATE_LIMIT);
  const routes = new Hono<AppEnv>();

  routes.get("/api/health", (c) => c.json({ ok: true, rooms: store.size }));

  routes.post("/api/rooms", async (c) => {
    if (!creations.tryAcquire(clientIp(c), now()))
      return c.json({ error: "Trop de séances créées, réessaie dans une minute." }, 429);
    const request = await readBody(c, CreateRoomRequest, "Colle un lien https vers une playlist .m3u8.");
    const creator = accounts.accountFor(sessionToken(c));
    try {
      const room = await rooms.create(new URL(request.url), request.title, creator?.id);
      return c.json({ code: room.code } satisfies CreateRoomResponse, 201);
    } catch (error) {
      const message = importErrorMessage(error);
      if (message === null) throw error;
      throw new UserFacingError(message, 422);
    }
  });

  routes.get("/api/rooms/:code", (c) => {
    const code = c.req.param("code");
    const room = isRoomCode(code) ? store.get(code) : undefined;
    if (!room) return c.json({ error: "Cette séance n'existe plus." }, 404);
    return c.json(room.snapshot());
  });

  routes.get("/api/rooms/:code/hls/:file", (c) => {
    const room = store.get(c.req.param("code"));
    const playlist = room?.imported.playlists.get(c.req.param("file"));
    if (!playlist) return c.notFound();
    return c.body(playlist, 200, {
      "content-type": "application/vnd.apple.mpegurl",
      "cache-control": "no-store",
    });
  });

  routes.get("/api/rooms/:code/subs/:file", (c) => {
    const room = store.get(c.req.param("code"));
    const vtt = room?.imported.subtitleFiles.get(c.req.param("file").replace(/\.vtt$/, ""));
    if (!vtt) return c.notFound();
    return c.body(vtt, 200, { "content-type": "text/vtt; charset=utf-8", "cache-control": "private, max-age=86400" });
  });

  return routes;
}
