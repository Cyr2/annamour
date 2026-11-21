import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { sendNotification } from "web-push";
import { createApp } from "./app.ts";
import { bridgeFetcher, bridgeHealth, NakaCatalog } from "./catalog/naka-catalog.ts";
import { skipFetcher } from "./catalog/skip-sources.ts";
import { tmdbFetcher } from "./catalog/tmdb.ts";
import { loadConfig } from "./config.ts";
import { describeMedia, ffmpegAudioEncoder, ffmpegAvailable, ffmpegEncoder, firstTimestamp } from "./media/ffmpeg.ts";
import {
  checkHevcSegment,
  ffmpegHevcEncoder,
  fmp4AudioEncoder,
  fmp4SourceAudio,
  x265Available,
} from "./media/hevc-ffmpeg.ts";
import { segmentSource } from "./media/segment-source.ts";
import { BYTES_PER_GB } from "./media/storage-cap.ts";
import { Transcoder } from "./media/transcoder.ts";
import { attachRealtime } from "./realtime.ts";
import { CHECKPOINT_INTERVAL_MS } from "./room-store.ts";
import { localTestFetchBytes, localTestFetchText, safeFetchBytes, safeFetchText } from "./safe-fetch.ts";
import { createServices } from "./services/services.ts";
import { openDatabase } from "./storage/database.ts";

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
/** Reminders and the evening check are read from the database every minute: a restart loses none. */
const NOTIFY_INTERVAL_MS = 60 * 1000;
/** A reminder unread for an hour is no use any more: the push service may drop it. */
const PUSH_TTL_S = 60 * 60;

const config = loadConfig(process.env);
const { vapid } = config;
mkdirSync(config.dataDir, { recursive: true });
const db = openDatabase(join(config.dataDir, "annamour.db"));
const { nakaBridge } = config;
// The end-to-end tests serve their film from a fake CDN on localhost (refused in production by loadConfig).
const fetchText = config.allowLocalMedia ? localTestFetchText : safeFetchText;
const fetchBytes = config.allowLocalMedia ? localTestFetchBytes : safeFetchBytes;
const transcoder = await lowQualityTranscoder();
const services = createServices({
  db,
  pepper: config.pepper,
  fetchText,
  relyingParty: config.relyingParty,
  mediaMaxBytes: config.mediaMaxGb * BYTES_PER_GB,
  alertAccounts: config.alertAccounts,
  healthCheckHour: config.healthCheckHour,
  ...(vapid
    ? {
        vapidPublicKey: vapid.publicKey,
        pushSender: (subscription, payload) =>
          sendNotification(subscription, payload, { vapidDetails: vapid, TTL: PUSH_TTL_S }),
      }
    : {}),
  ...(nakaBridge
    ? {
        catalog: new NakaCatalog(bridgeFetcher(nakaBridge.url, nakaBridge.secret)),
        nakaSkipFetch: bridgeFetcher(nakaBridge.url, nakaBridge.secret, 15_000),
        bridgeHealthy: bridgeHealth(nakaBridge.url),
      }
    : {}),
  ...(config.tmdbToken ? { tmdbFetch: tmdbFetcher(config.tmdbToken), skipFetch: skipFetcher } : {}),
  ...(transcoder
    ? {
        transcoder,
        timelineProbe: {
          source: segmentSource(fetchBytes, nakaBridge),
          firstTimestamp,
          describe: describeMedia,
          log: console.info,
        },
      }
    : {}),
});

/** HEVC's encoders; with `full`, the source's sound in fMP4 too, for the complete ladder. */
function hevcEncoders(full: boolean) {
  const encoders = { encode: ffmpegHevcEncoder, check: checkHevcSegment, encodeAudio: fmp4AudioEncoder };
  return full ? { ...encoders, sourceAudio: fmp4SourceAudio } : encoders;
}

/** Lighter qualities for weak links, made with ffmpeg when it is installed (it is in the Docker image). */
async function lowQualityTranscoder(): Promise<Transcoder | undefined> {
  if (config.transcodeWorkers === 0 || !(await ffmpegAvailable())) {
    console.info("Lighter qualities off (no ffmpeg, or TRANSCODE_WORKERS=0)");
    return undefined;
  }
  const dir = join(config.dataDir, "media");
  mkdirSync(dir, { recursive: true });
  const hevc = config.hevc && (await x265Available());
  if (config.hevc && !hevc) console.info("HEVC off: this ffmpeg has no libx265");
  return new Transcoder({
    dir,
    source: segmentSource(fetchBytes, nakaBridge),
    encode: ffmpegEncoder,
    ...(config.lightAudio ? { encodeAudio: ffmpegAudioEncoder } : {}),
    ...(hevc ? { hevc: hevcEncoders(config.hevcFull) } : {}),
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
const notifier = setInterval(() => {
  void services.plans.remind().catch((error: unknown) => console.warn("Reminders failed", error));
  void services.health.checkIfDue().catch((error: unknown) => console.warn("Catalog check failed", error));
}, NOTIFY_INTERVAL_MS);
if (!vapid) console.info("Notifications off (no VAPID keys)");
// Encodes left from before a restart are not tracked any more: free their space.
void services.lowQualities.sweep().catch((error: unknown) => console.warn("Media sweep failed", error));

function shutdown(): void {
  clearInterval(checkpoint);
  clearInterval(sweeper);
  clearInterval(notifier);
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
