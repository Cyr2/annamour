/*
 * Measures on the real TV (`pnpm --filter @annamour/e2e perf-tv:appareil`).
 *
 * Needs the debug build of apps/android-tv installed (it sits next to the
 * real app), opened on a local server and its WebView's DevTools forwarded:
 *
 *   adb reverse tcp:8797 tcp:8797
 *   adb shell am start -n fr.dpessin.annamour.tv.debug/fr.dpessin.annamour.tv.MainActivity --es url "http://localhost:8797/?tv=1"
 *   adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>   (pid: cat /proc/net/unix | grep devtools)
 *
 * It links the TV to a fresh local account if needed, then for each style
 * variant (PERF_VARIANTS, see VARIANTS) presses the arrows with the real
 * remote path (adb input keyevent) and reports each key's time to paint and
 * the frames drawn. TV_SERIAL and TV_BASE override the device and the server.
 */
import { execFileSync } from "node:child_process";
import { chromium, type Page } from "@playwright/test";
import { createSession, onboard } from "../tests/helpers.ts";
import { installProbe, type PageProbe } from "./probe.ts";

const SERIAL = process.env.TV_SERIAL ?? "192.168.1.20:5555";
const BASE = process.env.TV_BASE ?? "http://localhost:8797";
const DEVTOOLS = process.env.TV_DEVTOOLS ?? "http://localhost:9222";

const LIFT_OFF = "html[data-tv] *{scale:none!important}";
const HALO_OFF = "html[data-tv] :focus,html[data-tv] :is(.lg-glass,.am-frost):has(> :focus){box-shadow:none!important}";
/** Every remote target keeps its own layer: no layer made and dropped on each press. */
const LAYERS = "html[data-tv] :is(a,button,[role=slider]){will-change:transform}";
/** The glass panels' lit rim, a composited mask, costly to repaint. */
const RIM_OFF = "html[data-tv] .am-frost::before{display:none}";
/** The panels' long soft shadows (a 60 px blur). */
const SHADOWS_OFF = "html[data-tv] :is(.surface-panel,.shadow-float){box-shadow:var(--am-edge-light)!important}";
/** glisse's computed rim image and its radial sheen. */
const GLISSE_RIM_OFF =
  "html[data-tv] .lg-glass{background-image:none!important}html[data-tv] .lg-glass::after{display:none!important}";
/** Style changes to try against the current look (`actuel`). */
const VARIANTS: Record<string, string> = {
  actuel: "",
  "sans-zoom": LIFT_OFF,
  "sans-halo": HALO_OFF,
  "sans-ciel": ".am-ambient{display:none!important}",
  "ni-zoom-ni-halo": LIFT_OFF + HALO_OFF,
  "calques-fixes": LAYERS,
  "sans-liseré": RIM_OFF,
  "calques-et-liseré": LAYERS + RIM_OFF,
  "+sans-ombres": LAYERS + RIM_OFF + SHADOWS_OFF,
  "+sans-reflet-glisse": LAYERS + RIM_OFF + GLISSE_RIM_OFF,
  "+les-deux": LAYERS + RIM_OFF + SHADOWS_OFF + GLISSE_RIM_OFF,
};

/** Down, down, right, left, down, up, up, up, twice: the home screen's rows and top bar. */
const KEYS = "20 20 22 21 20 19 19 19 20 20 22 21 20 19 19 19".split(" ");

const adb = (...args: string[]) => execFileSync("adb", ["-s", SERIAL, ...args], { encoding: "utf8" });

const percentile = (values: readonly number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};

async function linkIfNeeded(tv: Page) {
  if (!tv.url().includes("/tv/lier")) return;
  const label = await tv.getByRole("img", { name: /^Code / }).getAttribute("aria-label");
  const code = (label ?? "").replace("Code ", "").replaceAll(" ", "");
  const browser = await chromium.launch({ channel: "chrome" });
  const phone = await (await browser.newContext({ baseURL: BASE })).newPage();
  await onboard(phone, "Darius");
  await phone.goto(`/tv#${code}`);
  await phone.getByRole("button", { name: "Lier la TV" }).click();
  await phone.getByRole("heading", { name: "La TV est liée" }).waitFor();
  await phone.goto("/");
  await createSession(phone, "Soirée télé");
  await phone.goto("/");
  await createSession(phone, "Deuxième soirée");
  await browser.close();
}

/** gfxinfo's view of the same presses: every frame Android drew, WebView included. */
function gfxinfo(pkg: string) {
  const out = adb("shell", `dumpsys gfxinfo ${pkg}`);
  const pick = (label: string) => out.match(new RegExp(`${label}: (\\d+)`))?.[1] ?? "?";
  return {
    frames: pick("Total frames rendered"),
    p50: pick("50th percentile"),
    p90: pick("90th percentile"),
    p99: pick("99th percentile"),
  };
}

async function measure(tv: Page, name: string, css: string) {
  await tv.goto(`${BASE}/`);
  // Let a late reload (the app updating itself) happen before styling and probing the page.
  await tv.waitForTimeout(4000);
  await tv.waitForLoadState("load");
  if (css) await tv.addStyleTag({ content: css });
  await tv.waitForTimeout(1500);
  await tv.evaluate(installProbe);
  const pkg = "fr.dpessin.annamour.tv.debug";
  adb("shell", `dumpsys gfxinfo ${pkg} reset`);
  adb("shell", KEYS.map((key) => `input keyevent ${key}; sleep 0.5;`).join(" "));
  const probe: PageProbe = await tv.evaluate(() => window.__perf);
  const keys = probe.keys.map((key) => key.duration);
  const all = [...keys, ...Array<number>(Math.max(0, KEYS.length - keys.length)).fill(8)];
  return {
    variante: name,
    appuiMediane: percentile(all, 50),
    appuiPire: Math.max(...all),
    imagesLentes: probe.frames.filter((frame) => frame > 50).length,
    pireImage: Math.round(Math.max(0, ...probe.frames)),
    gfx: gfxinfo(pkg),
  };
}

const devtools = await chromium.connectOverCDP(DEVTOOLS);
const tv = devtools.contexts()[0]?.pages()[0];
if (!tv) throw new Error("No page on the TV: open the debug app and forward its DevTools (see the top of this file).");
await linkIfNeeded(tv);
const wanted = process.env.PERF_VARIANTS?.split(",") ?? Object.keys(VARIANTS);
const rows = [];
for (const name of wanted) rows.push(await measure(tv, name, VARIANTS[name] ?? ""));
for (const { gfx, ...row } of rows)
  console.info(JSON.stringify({ ...row, gfxP50: gfx.p50, gfxP90: gfx.p90, gfxP99: gfx.p99, gfxImages: gfx.frames }));
await devtools.close();
