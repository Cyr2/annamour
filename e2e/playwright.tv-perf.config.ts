import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

/*
 * The TV performance bench (`pnpm e2e:perf-tv`): the real server and PWA, a
 * browser shaped like the projector's WebView (960x540 at 2x, a slow CPU, no
 * GPU so every blur and filter is paid for in frames). It measures, it does
 * not judge: timings vary from one machine to the next, so it never runs in
 * CI. Compare two runs on the same machine (PERF_LABEL names the report).
 * E2E_BASE_URL measures a deployed instance instead.
 */

const PORT = Number(process.env.E2E_PERF_PORT ?? 8793);
const ROOT = join(import.meta.dirname, "..");
const EXTERNAL_URL = process.env.E2E_BASE_URL?.trim() || undefined;
const LOCAL_URL = `http://localhost:${PORT}`;
/** PERF_GPU=1 keeps the GPU: closer to a desktop, further from a TV chip. */
const SOFTWARE_RENDERING = process.env.PERF_GPU !== "1";

export default defineConfig({
  testDir: "tv-perf",
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: EXTERNAL_URL ?? LOCAL_URL,
    channel: "chrome",
    launchOptions: {
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--mute-audio",
        ...(SOFTWARE_RENDERING ? ["--disable-gpu", "--disable-gpu-compositing"] : []),
      ],
    },
  },
  webServer: EXTERNAL_URL
    ? undefined
    : {
        command: "pnpm --filter @annamour/web build && pnpm --filter @annamour/server start",
        cwd: ROOT,
        url: `${LOCAL_URL}/api/health`,
        timeout: 180_000,
        reuseExistingServer: false,
        env: {
          PORT: String(PORT),
          DATA_DIR: mkdtempSync(join(tmpdir(), "annamour-perf-")),
          WEB_DIST: join(ROOT, "apps/web/dist"),
          ORIGIN: LOCAL_URL,
        },
      },
});
