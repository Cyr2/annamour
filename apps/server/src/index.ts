import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { bridgeFetcher, NakaCatalog } from "./catalog/naka-catalog.ts";
import { loadConfig } from "./config.ts";
import { ffmpegAvailable, ffmpegEncoder, firstTimestamp } from "./media/ffmpeg.ts";
import { segmentSource } from "./media/segment-source.ts";
import { Transcoder } from "./media/transcoder.ts";
import { attachRealtime } from "./realtime.ts";
import { CHECKPOINT_INTERVAL_MS } from "./room-store.ts";
import { safeFetchBytes } from "./safe-fetch.ts";
import { createServices } from "./services/services.ts";
import { openDatabase } from "./storage/database.ts";

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

const config = loadConfig(process.env);
mkdirSync(config.dataDir, { recursive: true });
const db = openDatabase(join(config.dataDir, "annamour.db"));
const { nakaBridge } = config;
const transcoder = await lowQualityTranscoder();
const services = createServices({
  db,
  pepper: config.pepper,
  relyingParty: config.relyingParty,
  ...(nakaBridge ? { catalog: new NakaCatalog(bridgeFetcher(nakaBridge.url, nakaBridge.secret)) } : {}),
  ...(transcoder
    ? {
        transcoder,
        timelineProbe: { source: segmentSource(safeFetchBytes, nakaBridge), firstTimestamp, log: console.info },
      }
    : {}),
});

/** Lighter qualities for weak links, made with ffmpeg when it is installed (it is in the Docker image). */
async function lowQualityTranscoder(): Promise<Transcoder | undefined> {
  if (config.transcodeWorkers === 0 || !(await ffmpegAvailable())) {
    console.info("Lighter qualities off (no ffmpeg, or TRANSCODE_WORKERS=0)");
    return undefined;
  }
  const dir = join(config.dataDir, "media");
  mkdirSync(dir, { recursive: true });
  return new Transcoder({
    dir,
    source: segmentSource(safeFetchBytes, nakaBridge),
    encode: ffmpegEncoder,
    workers: config.transcodeWorkers,
  });
}
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
  services.playbackStats.sweep();
  void services.lowQualities.sweep().catch((error: unknown) => console.warn("Media sweep failed", error));
}, SWEEP_INTERVAL_MS);
// Encodes left from before a restart are not tracked any more: free their space.
void services.lowQualities.sweep().catch((error: unknown) => console.warn("Media sweep failed", error));

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
