import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { attachRealtime } from "./realtime.ts";
import { RoomStore } from "./rooms.ts";

const port = Number(process.env.PORT ?? 8787);
const webDist = resolve(process.env.WEB_DIST ?? "../web/dist");

const store = new RoomStore();
const app = createApp({ store, ...(existsSync(webDist) ? { webDist } : {}) });

const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.info(`Annamour server on http://localhost:${info.port}${existsSync(webDist) ? " (serving PWA)" : ""}`);
});
const wss = attachRealtime(server, store);

const sweeper = setInterval(() => store.sweep(Date.now()), 10 * 60 * 1000);

function shutdown(): void {
  clearInterval(sweeper);
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
