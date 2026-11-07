import { type Browser, type CDPSession, expect, type Page, test } from "@playwright/test";
import { createSession, onboard, videoTime } from "../tests/helpers.ts";
import { ffmpegInstalled } from "./media.ts";

/*
 * One person on fiber, one on a weak, changing link like the real 4G it was
 * modelled on (Speedtest on that tethered connection: 4.9, 1.3, 2.3 Mb/s,
 * 61 → 334 ms under load). They watch together for about three minutes; the
 * app's own playback stats then say how often and how long the weak one was
 * stuck, and at which heights it played. The table printed in the log is the
 * point: compare it from one change to the next.
 */

const FILM = "https://localhost:8791/master.m3u8";
/** Download rate (kb/s) of the weak link, one step every 35 s. */
const PROFILE_KBPS = [4900, 1300, 2300, 900, 3000];
const STEP_MS = 35_000;
const LATENCY_MS = 300;
const UPLOAD_KBPS = 1500;
/** Lenient on purpose for now: the measurement matters more than the bar. */
const MAX_REBUFFER_RATIO = 0.15;

interface Report {
  name: string;
  device: string;
  engine: string;
  watchedSeconds: number;
  stallCount: number;
  stallSeconds: number;
  startupMs: number | null;
  rebufferRatio: number;
  heights: Array<{ height: number; seconds: number }>;
}

async function viewer(browser: Browser): Promise<Page> {
  // Service workers off: requests they make would escape the throttling of the page.
  const context = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: "block" });
  // The browser keeps 250 resource timings by default: far fewer than the segments of a film.
  await context.addInitScript(() => performance.setResourceTimingBufferSize(100_000));
  return context.newPage();
}

/** One DevTools session per page: a second one would not override the first one's conditions. */
const sessions = new WeakMap<Page, CDPSession>();

async function throttle(page: Page, kbps: number) {
  let cdp = sessions.get(page);
  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    sessions.set(page, cdp);
  }
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: LATENCY_MS,
    downloadThroughput: (kbps * 1000) / 8,
    uploadThroughput: (UPLOAD_KBPS * 1000) / 8,
  });
}

/**
 * The download rate the weak viewer really got (kb/s) since `since` (ms on its
 * page clock), from the segments' resource timings: proof the throttling holds.
 */
function observed(page: Page, since: number): Promise<string> {
  return page.evaluate((from) => {
    const entries = performance
      .getEntriesByType("resource")
      .filter((e): e is PerformanceResourceTiming => e instanceof PerformanceResourceTiming)
      .filter((e) => e.startTime >= from && /\.(ts|aac)(\?|$)/.test(e.name));
    const bytes = entries.reduce((sum, e) => sum + e.transferSize, 0);
    const busyMs = entries.reduce((sum, e) => sum + (e.responseEnd - e.startTime), 0);
    const kbps = busyMs > 0 ? Math.round((bytes * 8) / busyMs) : 0;
    return `${entries.length} segments, ${Math.round(bytes / 1024)} KB, ${kbps} kb/s while fetching`;
  }, since);
}

function table(reports: readonly Report[]): string {
  const rows = reports.map((r) => {
    const heights = r.heights
      .toSorted((a, b) => a.height - b.height)
      .map((h) => `${h.height}p ${Math.round(h.seconds)}s`)
      .join(", ");
    return [
      r.name.padEnd(6),
      `${r.device}/${r.engine}`.padEnd(16),
      `${Math.round(r.watchedSeconds)}s`.padStart(6),
      String(r.stallCount).padStart(7),
      `${r.stallSeconds.toFixed(1)}s`.padStart(8),
      `${(r.rebufferRatio * 100).toFixed(1)} %`.padStart(9),
      `${r.startupMs ?? "-"}`.padStart(9),
      heights,
    ].join(" | ");
  });
  const header = "who    | device/engine    | watched | stalls | stalled | rebuffer | start ms | seconds per height";
  return ["", "=== Weak-network measurement ===", header, ...rows, ""].join("\n");
}

test.skip(!ffmpegInstalled(), "needs ffmpeg to make the film and its lighter qualities");

test("un spectateur sur une 4G faible et changeante regarde avec un autre sur la fibre", async ({ browser }) => {
  const fiber = await viewer(browser);
  const weak = await viewer(browser);

  await onboard(fiber, "Fibre");
  const roomUrl = await createSession(fiber, "Mesure réseau faible", FILM);
  const code = roomUrl.split("/").at(-1) ?? "";
  // The weak link is weak from the start: the player fills its lead behind the salon, before the film starts.
  await throttle(weak, PROFILE_KBPS[0] ?? 0);
  await onboard(weak, "4G", roomUrl);
  await expect(fiber.getByRole("heading", { name: "4G est là" })).toBeVisible();
  // As people are told to: start once the salon says the lighter qualities are ready.
  await expect(fiber.getByText("Vidéo prête pour toutes les connexions")).toBeVisible({ timeout: 180_000 });

  const inSalon = await observed(weak, 0);
  const beforeStart = await weak.evaluate(() => performance.now());
  await fiber.getByRole("button", { name: "Lancer le film" }).click();
  await expect.poll(() => videoTime(fiber), { timeout: 60_000 }).toBeGreaterThan(2);
  const steps = [
    `in the salon (at ${PROFILE_KBPS[0]} kb/s) → ${inSalon}`,
    `from the launch to the profile → ${await observed(weak, beforeStart)}`,
  ];
  for (const kbps of PROFILE_KBPS) {
    await throttle(weak, kbps);
    const since = await weak.evaluate(() => performance.now());
    await weak.waitForTimeout(STEP_MS);
    steps.push(`${kbps} kb/s asked → ${await observed(weak, since)}`);
  }
  // Large leads may fetch nothing in some steps (0): that is the lead doing its job.
  console.info(["", "=== Weak link, step by step ===", ...steps].join("\n"));

  // Stats go out every minute: wait for the weak viewer's to cover the whole run.
  const reports = async () =>
    ((await (await fiber.request.get(`/api/rooms/${code}/stats`)).json()) as { reports: Report[] }).reports;
  const watched = async () => (await reports()).find((r) => r.name === "4G")?.watchedSeconds ?? 0;
  await expect.poll(watched, { timeout: 120_000, intervals: [5000] }).toBeGreaterThan(100);

  const all = await reports();
  console.info(table(all));
  const weakReport = all.find((r) => r.name === "4G");
  expect(weakReport?.rebufferRatio ?? 1).toBeLessThan(MAX_REBUFFER_RATIO);
});
