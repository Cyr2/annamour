import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { UserFacingError } from "./errors.ts";
import type { AppEnv, HttpOptions } from "./http/context.ts";
import { accountRoutes } from "./routes/account.ts";
import { catalogRoutes } from "./routes/catalog.ts";
import { circleRoutes } from "./routes/circles.ts";
import { passkeyRoutes } from "./routes/passkey.ts";
import { pushRoutes } from "./routes/push.ts";
import { ratingRoutes } from "./routes/ratings.ts";
import { roomRoutes } from "./routes/rooms.ts";
import { sessionRoutes } from "./routes/sessions.ts";
import { statsRoutes } from "./routes/stats.ts";
import { suggestionRoutes } from "./routes/suggestions.ts";
import { tvPairingRoutes } from "./routes/tv-pairing.ts";
import { watchlistRoutes } from "./routes/watchlist.ts";
import type { Services } from "./services/services.ts";

export interface AppOptions extends Partial<HttpOptions> {
  /** Built PWA to serve; omitted in development (Vite serves it). */
  webDist?: string;
}

function serveWebApp(app: Hono<AppEnv>, webDist: string): void {
  // The app's text (scripts, styles, the page) goes out gzipped: a third of the bytes on a phone's network.
  // Registered after the API, so only the web app's responses pass through it.
  app.use("*", compress());
  // What a cache may keep, said for every file (unsaid, a proxy decides: Cloudflare held the old sw.js for
  // hours, so the installed app never saw a new version). Vite fingerprints /assets: those never change.
  // Everything else (the page, sw.js, the manifest, registerSW.js, workbox-*.js) is checked on every use.
  // (serveStatic's onFound hook does not reach the response in @hono/node-server 2, hence this wrapper.)
  app.use("*", async (c, next) => {
    await next();
    const hashed =
      c.req.path.startsWith("/assets/") && c.res.ok && !c.res.headers.get("content-type")?.includes("html");
    c.res.headers.set("cache-control", hashed ? "public, max-age=31536000, immutable" : "no-cache");
    if (!hashed) c.res.headers.set("cdn-cache-control", "no-store");
  });
  app.use("*", serveStatic({ root: webDist }));
  // SPA fallback for client routes only. A missing file (anything with an extension) is a 404: served the page
  // instead, a CDN keyed on the extension kept it for hours in place of a new home-screen icon.
  let indexHtml: string | undefined;
  app.get("*", async (c) => {
    if (/\.[a-z0-9]+$/i.test(new URL(c.req.url).pathname)) return c.notFound();
    indexHtml ??= await readFile(join(webDist, "index.html"), "utf8");
    return c.html(indexHtml);
  });
}

export function createApp(services: Services, { webDist, production = false }: AppOptions = {}) {
  const deps = { services, http: { production } };
  const app = new Hono<AppEnv>();

  app.onError((error, c) => {
    if (error instanceof UserFacingError) return c.json({ error: error.message }, error.status);
    console.error(error);
    return c.json({ error: "Un souci est survenu de notre côté. Réessaie dans un instant." }, 500);
  });

  app.route("/", roomRoutes(deps));
  app.route("/", catalogRoutes(deps));
  app.route("/", accountRoutes(deps));
  app.route("/", passkeyRoutes(deps));
  app.route("/", sessionRoutes(deps));
  app.route("/", tvPairingRoutes(deps));
  app.route("/", watchlistRoutes(deps));
  app.route("/", circleRoutes(deps));
  app.route("/", statsRoutes(deps));
  app.route("/", ratingRoutes(deps));
  app.route("/", suggestionRoutes(deps));
  app.route("/", pushRoutes(deps));
  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  if (webDist) serveWebApp(app, webDist);
  return app;
}
