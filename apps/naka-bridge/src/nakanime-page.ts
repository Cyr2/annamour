import type { Page, Route } from "playwright";
import type { NakaAnswer, NakanimeCaller } from "./bridge.ts";
import { sharedContext } from "./browser.ts";
import { CHALLENGE_TITLE, CHALLENGE_WAIT_MS } from "./naka-page.ts";
import { isPlaylistRequest, pickSearch, pickSources } from "./nakanime-reading.ts";

const ORIGIN = "https://nakanime.tv";
/** How long the app gets to load and decrypt what it shows. */
const READ_WAIT_MS = 20_000;
const POLL_MS = 400;
const PLAYER_WAIT_MS = 30_000;
/** What a page needs no part of to be read: never downloaded, so Nakanime and its players carry less. */
const SKIPPED = new Set(["image", "media", "font"]);

const NOT_FOUND: NakaAnswer = { status: 404, body: JSON.stringify({ error: "not found on Nakanime" }) };
const CHALLENGE_FAILED: NakaAnswer = {
  status: 503,
  body: JSON.stringify({ error: "Cloudflare challenge not passed" }),
};

declare global {
  interface Window {
    __annamourRead?: string[];
  }
}

/** Notes every JSON text the app reads (after its own decryption), at most a few dozen. */
function noteJsonReads(): void {
  const parse = JSON.parse;
  window.__annamourRead = [];
  JSON.parse = function (text: string, reviver?: (key: string, value: unknown) => unknown) {
    const value: unknown = parse.call(this, text, reviver);
    const read = window.__annamourRead;
    if (typeof text === "string" && text.length > 2 && read && read.length < 60) read.push(text.slice(0, 2_000_000));
    return value;
  };
}

function light(route: Route): Promise<void> {
  const request = route.request();
  // The episode page opens its player in a frame: the bridge resolves players itself, one at a time.
  const otherFrame = request.resourceType() === "document" && request.frame().parentFrame() !== null;
  return SKIPPED.has(request.resourceType()) || otherFrame ? route.abort() : route.fallback();
}

/**
 * Nakanime read in a tab of the bridge's browser, as a person would: the
 * catalog page for a search, the anime's page for its episodes, the episode's
 * page for its sources, and the player's page for its video. Nakanime's team
 * agreed to this use, as Naka's did, as long as their site never suffers from it.
 */
export class NakanimePage implements NakanimeCaller {
  private page: Page | null = null;

  async search(query: string): Promise<NakaAnswer> {
    return this.read(`/catalog?q=${encodeURIComponent(query)}`, pickSearch);
  }

  async title(id: number, slug: string): Promise<NakaAnswer> {
    const page = await this.open(`/anime/${id}/${slug}`);
    if (page === null) return CHALLENGE_FAILED;
    const data = await page
      .locator("script#anime-data")
      .textContent({ timeout: READ_WAIT_MS })
      .catch(() => null);
    return data ? { status: 200, body: data } : NOT_FOUND;
  }

  async sources(id: number, season: number, episode: number): Promise<NakaAnswer> {
    return this.read(`/anime/${id}/season/${season}/episode/${episode}`, pickSources);
  }

  /** Opens the player alone, with Nakanime as referrer, and keeps the first playlist it asks for. */
  async resolve(player: URL): Promise<NakaAnswer> {
    const page = await (await sharedContext()).newPage();
    try {
      await page.route("**/*", light);
      page.on("popup", (popup) => void popup.close().catch(() => undefined));
      const playlist = page.waitForRequest((request) => isPlaylistRequest(request.url()), { timeout: PLAYER_WAIT_MS });
      await page.goto(player.href, { referer: `${ORIGIN}/`, waitUntil: "domcontentloaded", timeout: PLAYER_WAIT_MS });
      const url = (await playlist.catch(() => null))?.url();
      return url ? { status: 200, body: JSON.stringify({ url }) } : NOT_FOUND;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /** Opens a page and waits for the app to read the JSON `pick` recognises. */
  private async read(path: string, pick: (texts: readonly string[]) => string | null): Promise<NakaAnswer> {
    const page = await this.open(path);
    if (page === null) return CHALLENGE_FAILED;
    for (let waited = 0; waited < READ_WAIT_MS; waited += POLL_MS) {
      const found = pick(await page.evaluate(() => window.__annamourRead ?? []));
      if (found !== null) return { status: 200, body: found };
      await page.waitForTimeout(POLL_MS);
    }
    return NOT_FOUND;
  }

  /** The tab on `path`, past Cloudflare's check; null when the check is not passed. */
  private async open(path: string): Promise<Page | null> {
    const page = await this.tab();
    await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: CHALLENGE_WAIT_MS });
    try {
      await page.waitForFunction((pattern) => !new RegExp(pattern, "i").test(document.title), CHALLENGE_TITLE.source, {
        timeout: CHALLENGE_WAIT_MS,
      });
      return page;
    } catch {
      console.warn(`Cloudflare challenge still shown on nakanime.tv: "${await page.title()}"`);
      return null;
    }
  }

  private async tab(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    const page = await (await sharedContext()).newPage();
    await page.addInitScript(noteJsonReads);
    await page.route("**/*", light);
    this.page = page;
    return page;
  }
}
