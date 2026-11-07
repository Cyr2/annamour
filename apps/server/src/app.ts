import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { UserFacingError } from "./errors.ts";
import type { AppEnv, HttpOptions } from "./http/context.ts";
import { accountRoutes } from "./routes/account.ts";
import { catalogRoutes } from "./routes/catalog.ts";
import { passkeyRoutes } from "./routes/passkey.ts";
import { roomRoutes } from "./routes/rooms.ts";
import { sessionRoutes } from "./routes/sessions.ts";
import { tvPairingRoutes } from "./routes/tv-pairing.ts";
import type { Services } from "./services/services.ts";

export interface AppOptions extends Partial<HttpOptions> {
  /** Built PWA to serve; omitted in development (Vite serves it). */
  webDist?: string;
}

function serveWebApp(app: Hono<AppEnv>, webDist: string): void {
  // The app's text (scripts, styles, the page) goes out gzipped: a third of the bytes on a phone's network.
  // Registered after the API, so only the web app's responses pass through it.
  app.use("*", compress());
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
  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  if (webDist) serveWebApp(app, webDist);
  return app;
}
