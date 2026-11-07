import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { attachRealtime } from "./realtime.ts";
import { CHECKPOINT_INTERVAL_MS } from "./room-store.ts";
import { createServices } from "./services/services.ts";
import { openDatabase } from "./storage/database.ts";

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

const config = loadConfig(process.env);
mkdirSync(config.dataDir, { recursive: true });
const db = openDatabase(join(config.dataDir, "annamour.db"));
const services = createServices({ db, pepper: config.pepper, relyingParty: config.relyingParty });
const servesWeb = existsSync(config.webDist);
const app = createApp(services, { production: config.production, ...(servesWeb ? { webDist: config.webDist } : {}) });

const server = serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
  console.info(`Annamour server on http://localhost:${info.port}${servesWeb ? " (serving PWA)" : ""}`);
});
const wss = attachRealtime(server, services);

const checkpoint = setInterval(() => services.store.checkpoint(Date.now()), CHECKPOINT_INTERVAL_MS);
const sweeper = setInterval(() => {
  services.store.sweep(Date.now());
  services.accounts.sweep();
  services.tvPairings.sweep();
}, SWEEP_INTERVAL_MS);

function shutdown(): void {
  clearInterval(checkpoint);
  clearInterval(sweeper);
  // Keep where every running session was, so it resumes there after the restart.
  services.store.checkpoint(Date.now());
  wss.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
