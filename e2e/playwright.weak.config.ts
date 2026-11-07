import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { CERT_FILE, ffmpegInstalled, prepareWeakNetworkMedia } from "./weak-network/media.ts";

/*
 * The weak-network measurement (`pnpm e2e:reseau-faible`): the real server,
 * with its lighter qualities, a fake CDN serving a Naka-like film, and two
 * browsers, one of them on a throttled link. Needs ffmpeg (and openssl);
 * without them the test is skipped.
 */

const PORT = Number(process.env.E2E_WEAK_PORT ?? 8792);
const CDN_PORT = 8791;
const ROOT = join(import.meta.dirname, "..");
const LOCAL_URL = `http://localhost:${PORT}`;
const ready = ffmpegInstalled();
if (ready) prepareWeakNetworkMedia();

export default defineConfig({
  testDir: "weak-network",
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: LOCAL_URL,
    channel: "chrome",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] },
    trace: "retain-on-failure",
  },
  webServer: ready
    ? [
        {
          command: "node weak-network/cdn.ts",
          cwd: import.meta.dirname,
          url: `https://localhost:${CDN_PORT}/health`,
          ignoreHTTPSErrors: true,
          env: { CDN_PORT: String(CDN_PORT) },
          timeout: 60_000,
          reuseExistingServer: false,
        },
        {
          command: "pnpm --filter @annamour/web build && pnpm --filter @annamour/server start",
          cwd: ROOT,
          url: `${LOCAL_URL}/api/health`,
          timeout: 240_000,
          reuseExistingServer: false,
          env: {
            PORT: String(PORT),
            DATA_DIR: mkdtempSync(join(tmpdir(), "annamour-weak-")),
            WEB_DIST: join(ROOT, "apps/web/dist"),
            ORIGIN: LOCAL_URL,
            // The fake CDN lives on localhost, with a self-signed certificate the server is told to trust.
            E2E_ALLOW_LOCAL_MEDIA: "1",
            NODE_EXTRA_CA_CERTS: CERT_FILE,
            LIGHT_AUDIO: "on",
            TRANSCODE_WORKERS: "2",
          },
        },
      ]
    : undefined,
});
