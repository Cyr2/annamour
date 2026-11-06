import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 8790);
const ROOT = join(import.meta.dirname, "..");

/**
 * End-to-end: the real server serving the built PWA, two independent
 * browsers, a real HLS stream. Google Chrome is used because Playwright's
 * Chromium ships without the H.264/AAC codecs films use.
 */
export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @annamour/web build && pnpm --filter @annamour/server start",
    cwd: ROOT,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      DATA_DIR: mkdtempSync(join(tmpdir(), "annamour-e2e-")),
      WEB_DIST: join(ROOT, "apps/web/dist"),
      ORIGIN: `http://localhost:${PORT}`,
    },
  },
});
