import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CDPSession, expect, type Locator, type Page, test } from "@playwright/test";
import { createSession, onboard, person, videoTime } from "../tests/helpers.ts";
import { installProbe, type PageProbe } from "./probe.ts";

/** The projector's WebView: a 1080p screen at density 2, so 960x540 CSS px. */
const TV = {
  viewport: { width: 960, height: 540 },
  deviceScaleFactor: 2,
  userAgent:
    "Mozilla/5.0 (Linux; Android 11; Formovie Page Two Build/RP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 AnnamourTV/1.0",
};
/** How much slower than this machine the TV's CPU is assumed to be. */
const CPU_SLOWDOWN = Number(process.env.PERF_CPU ?? 6);
/** A remote held at a comfortable pace: one press every 250 ms. */
const KEY_GAP_MS = 250;
const LABEL = process.env.PERF_LABEL ?? "mesure";

const percentile = (values: readonly number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};
const round = (value: number) => Math.round(value * 10) / 10;

/** Frames: how smooth it looked. 16.7 ms is a full 60 fps frame; over 50 ms the eye sees a hitch. */
function frameStats({ frames, slowFrames }: PageProbe) {
  const total = frames.reduce((sum, frame) => sum + frame, 0);
  return {
    frames: frames.length,
    fps: round(total > 0 ? (frames.length * 1000) / total : 0),
    p50: round(percentile(frames, 50)),
    p95: round(percentile(frames, 95)),
    max: round(Math.max(0, ...frames)),
    hitches: frames.filter((frame) => frame > 50).length,
    /** The three slowest frames and what took their time. */
    slowest: [...slowFrames].sort((a, b) => b.duration - a.duration).slice(0, 3),
  };
}

/** Keys: how fast each press showed. Presses under 16 ms are not recorded by the browser: counted as 8 ms. */
function keyStats(probe: PageProbe, pressed: number) {
  const durations = probe.keys.map((key) => key.duration);
  const all = [...durations, ...Array<number>(Math.max(0, pressed - durations.length)).fill(8)];
  return {
    pressed,
    p50: round(percentile(all, 50)),
    p95: round(percentile(all, 95)),
    max: round(Math.max(0, ...all)),
    handlersMax: round(Math.max(0, ...probe.keys.map((key) => key.processing))),
  };
}

const readProbe = (page: Page) => page.evaluate(() => window.__perf);
const resetProbe = (page: Page) =>
  page.evaluate(() => {
    window.__perf.frames = [];
    window.__perf.keys = [];
    window.__perf.longTasks = [];
    window.__perf.slowFrames = [];
  });

async function pressAll(page: Page, keys: readonly string[]) {
  for (const key of keys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(KEY_GAP_MS);
  }
}

/** What the screen costs to draw: glass panes, and those bending their backdrop with an SVG filter. */
const glassCount = (page: Page) =>
  page.evaluate(() => {
    const glass = Array.from(document.querySelectorAll(".lg-glass, .am-frost"));
    const blurred = glass.filter((element) => getComputedStyle(element).backdropFilter !== "none");
    const bent = glass.filter((element) => getComputedStyle(element).backdropFilter.includes("url("));
    return {
      glass: glass.length,
      blurred: blurred.length,
      bent: bent.length,
      nodes: document.querySelectorAll("*").length,
    };
  });

/** The focus has landed since the last key (or since the page opened). */
const focusSettled = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(
        () => window.__perf.lastFocusAt > window.__perf.lastKeyAt && document.activeElement !== document.body,
      ),
    )
    .toBe(true);

/** A key that opens another screen: press to the new screen's focus, in ms. */
async function timeToFocus(page: Page, key: string, target?: Locator) {
  await page.keyboard.press(key);
  if (target) await expect(target).toBeFocused();
  else await focusSettled(page);
  await page.waitForTimeout(300);
  return Math.round(await page.evaluate(() => window.__perf.lastFocusAt - window.__perf.lastKeyAt));
}

/** Main-thread time spent so far, in ms (scripts, style, layout, paint). */
async function busyTime(cdp: CDPSession) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return (metrics.find((metric) => metric.name === "TaskDuration")?.value ?? 0) * 1000;
}

/** PERF_PROFILE=1: where the CPU went during each idle phase, the busiest functions first (self time). */
const PROFILE = process.env.PERF_PROFILE === "1";

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
}

function topFunctions(profile: { nodes: ProfileNode[]; samples?: number[]; timeDeltas?: number[] }) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const self = new Map<string, number>();
  (profile.samples ?? []).forEach((id, index) => {
    const frame = byId.get(id)?.callFrame;
    if (!frame) return;
    const name = `${frame.functionName || "(anonyme)"} ${frame.url.split("/").pop() ?? ""}:${frame.lineNumber}`;
    self.set(name, (self.get(name) ?? 0) + (profile.timeDeltas?.[index] ?? 0) / 1000);
  });
  return [...self.entries()]
    .filter(([name]) => !name.startsWith("(idle)"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, ms]) => `${Math.round(ms)}ms ${name}`);
}

/** Watching a screen without touching anything: frames, and the share of the time the page kept the CPU busy. */
async function idle(page: Page, cdp: CDPSession, ms: number) {
  await resetProbe(page);
  if (PROFILE) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
  }
  const before = await busyTime(cdp);
  await page.waitForTimeout(ms);
  const busy = (await busyTime(cdp)) - before;
  const profile = PROFILE ? topFunctions((await cdp.send("Profiler.stop")).profile) : undefined;
  return { ...frameStats(await readProbe(page)), busyPercent: round((busy / ms) * 100), profile };
}

async function startup(page: Page, cdp: CDPSession, cold: boolean) {
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: cold });
  await cdp.send("Network.setBypassServiceWorker", { bypass: cold });
  await page.reload();
  await focusSettled(page);
  await page.waitForTimeout(3000);
  const probe = await readProbe(page);
  const heap = await cdp.send("Runtime.getHeapUsage");
  return {
    firstPaint: Math.round(probe.firstContentfulPaint),
    largestPaint: Math.round(probe.largestContentfulPaint),
    remoteReady: Math.round(probe.firstFocusAt),
    longTasks: probe.longTasks.length,
    blocking: Math.round(probe.longTasks.reduce((sum, task) => sum + Math.max(0, task - 50), 0)),
    heapMb: round(heap.usedSize / 1048576),
  };
}

test("mesure la fluidité d'Annamour sur une TV lente", async ({ browser }) => {
  // Set up at full speed: an account, a TV linked to it, two séances to browse.
  const phone = await person(browser);
  const tvContext = await browser.newContext(TV);
  await tvContext.addInitScript(installProbe);
  // PERF_CSS tries a style change without rebuilding: its cost shows against a run without it.
  const trialCss = process.env.PERF_CSS;
  if (trialCss) {
    await tvContext.addInitScript((css) => {
      addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
      });
    }, trialCss);
  }
  const tv = await tvContext.newPage();
  await onboard(phone, "Darius");
  await tv.goto("/?tv=1");
  const label = await tv.getByRole("img", { name: /^Code / }).getAttribute("aria-label");
  await phone.goto(`/tv#${(label ?? "").replace("Code ", "").replaceAll(" ", "")}`);
  await phone.getByRole("button", { name: "Lier la TV" }).click();
  await expect(tv.getByRole("link", { name: "Mon profil, Darius" })).toBeVisible({ timeout: 10_000 });
  await phone.goto("/");
  const roomUrl = await createSession(phone, "Soirée télé");
  await phone.goto("/");
  await createSession(phone, "Deuxième soirée");

  const cdp = await tvContext.newCDPSession(tv);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  await cdp.send("Performance.enable");
  const report: Record<string, unknown> = {
    label: LABEL,
    cpuSlowdown: CPU_SLOWDOWN,
    gpu: process.env.PERF_GPU === "1",
  };

  report.coldStart = await startup(tv, cdp, true);
  report.warmStart = await startup(tv, cdp, false);
  report.homeGlass = await glassCount(tv);

  // Idle on the home screen: the sky alone.
  report.homeIdle = await idle(tv, cdp, 3000);

  // Browsing the home screen with the arrows.
  const homeKeys = ["ArrowDown", "ArrowDown", "ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "ArrowUp", "ArrowUp"];
  const browse = [...homeKeys, ...homeKeys];
  await resetProbe(tv);
  await pressAll(tv, browse);
  const browsed = await readProbe(tv);
  report.homeBrowse = { ...frameStats(browsed), keys: keyStats(browsed, browse.length) };

  // Screen changes: home → join (keyboard focused), back; home → salon.
  await tv.getByRole("link", { name: "Rejoindre avec un code" }).focus();
  report.openJoin = await timeToFocus(tv, "Enter", tv.getByRole("button", { name: "A", exact: true }));
  await resetProbe(tv);
  await pressAll(tv, [
    "ArrowRight",
    "ArrowRight",
    "ArrowDown",
    "ArrowRight",
    "ArrowDown",
    "ArrowLeft",
    "ArrowUp",
    "ArrowUp",
  ]);
  const typed = await readProbe(tv);
  report.joinKeyboard = { ...frameStats(typed), keys: keyStats(typed, 8) };
  report.backHome = await timeToFocus(tv, "Escape");

  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await tv.goto(roomUrl);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  const start = tv.getByRole("button", { name: "Lancer le film" });
  await expect(start).toBeFocused();
  report.salonGlass = await glassCount(tv);
  report.salonIdle = await idle(tv, cdp, 3000);

  // The film: playing alone, then with the controls up and the remote on them.
  await tv.keyboard.press("Enter");
  await expect.poll(() => videoTime(tv), { timeout: 60_000 }).toBeGreaterThan(2);
  report.filmPlaying = await idle(tv, cdp, 5000);

  await resetProbe(tv);
  await tv.keyboard.press("ArrowDown");
  await expect(tv.getByRole("button", { name: "Pause", exact: true })).toBeFocused();
  await pressAll(tv, ["ArrowRight", "ArrowRight", "ArrowLeft", "ArrowLeft", "ArrowUp", "ArrowDown"]);
  const controls = await readProbe(tv);
  report.filmControls = { ...frameStats(controls), keys: keyStats(controls, 7) };
  report.playerGlass = await glassCount(tv);

  const folder = join(import.meta.dirname, "..", "test-results");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `tv-perf-${LABEL}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.info(JSON.stringify(report, null, 2));
});
