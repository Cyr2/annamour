import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CreateRoomRequest, type CreateRoomResponse, isRoomCode } from "@annamour/protocol";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { HlsError, importHls } from "./hls.ts";
import type { RoomStore } from "./rooms.ts";
import { FetchError, safeFetchText, type TextFetcher } from "./safe-fetch.ts";

export interface AppOptions {
  store: RoomStore;
  fetchText?: TextFetcher;
  /** Built PWA to serve; omitted in development (Vite serves it). */
  webDist?: string;
  now?: () => number;
}

const DEFAULT_TITLE = "Notre séance";
const CREATE_LIMIT = { windowMs: 60_000, max: 10 };

/** First hop of X-Forwarded-For (the real client behind the proxy). */
function clientIp(forwardedFor: string | undefined): string {
  return forwardedFor?.split(",")[0]?.trim() ?? "local";
}

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

export function createApp({ store, fetchText = safeFetchText, webDist, now = Date.now }: AppOptions) {
  const app = new Hono();
  const createdBy = new Map<string, number[]>();

  app.get("/api/health", (c) => c.json({ ok: true, rooms: store.size }));

  app.post("/api/rooms", async (c) => {
    const ip = clientIp(c.req.header("x-forwarded-for"));
    const recent = (createdBy.get(ip) ?? []).filter((t) => now() - t < CREATE_LIMIT.windowMs);
    if (recent.length >= CREATE_LIMIT.max)
      return c.json({ error: "Trop de séances créées, réessaie dans une minute." }, 429);

    const parsed = CreateRoomRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Colle un lien https vers une playlist .m3u8." }, 400);

    try {
      const imported = await importHls(new URL(parsed.data.url), fetchText);
      const room = store.create(parsed.data.title ?? DEFAULT_TITLE, imported, now());
      createdBy.set(ip, [...recent, now()]);
      return c.json({ code: room.code } satisfies CreateRoomResponse, 201);
    } catch (error) {
      const message = importErrorMessage(error);
      if (message === null) throw error;
      return c.json({ error: message }, 422);
    }
  });

  app.get("/api/rooms/:code", (c) => {
    const code = c.req.param("code");
    const room = isRoomCode(code) ? store.get(code) : undefined;
    if (!room) return c.json({ error: "Cette séance n'existe plus." }, 404);
    return c.json(room.snapshot());
  });

  app.get("/api/rooms/:code/hls/:file", (c) => {
    const room = store.get(c.req.param("code"));
    const playlist = room?.imported.playlists.get(c.req.param("file"));
    if (!playlist) return c.notFound();
    return c.body(playlist, 200, {
      "content-type": "application/vnd.apple.mpegurl",
      "cache-control": "no-store",
    });
  });

  app.get("/api/rooms/:code/subs/:file", (c) => {
    const room = store.get(c.req.param("code"));
    const vtt = room?.imported.subtitleFiles.get(c.req.param("file").replace(/\.vtt$/, ""));
    if (!vtt) return c.notFound();
    return c.body(vtt, 200, { "content-type": "text/vtt; charset=utf-8", "cache-control": "private, max-age=86400" });
  });

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  if (webDist) {
    // Vite fingerprints everything under /assets, so those files never change.
    // (serveStatic's onFound hook does not reach the response in @hono/node-server 2, hence this wrapper.)
    app.use(
      "/assets/*",
      async (c, next) => {
        await next();
        if (c.res.ok) c.res.headers.set("cache-control", "public, max-age=31536000, immutable");
      },
      serveStatic({ root: webDist }),
    );
    app.use("*", serveStatic({ root: webDist }));
    // SPA fallback: every other path is a client route.
    let indexHtml: string | undefined;
    app.get("*", async (c) => {
      indexHtml ??= await readFile(join(webDist, "index.html"), "utf8");
      return c.html(indexHtml, 200, { "cache-control": "no-cache" });
    });
  }

  return app;
}
