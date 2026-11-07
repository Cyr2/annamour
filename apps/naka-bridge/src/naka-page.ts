import { type BrowserContext, chromium, type Page } from "playwright";
import type { NakaAnswer, NakaCaller } from "./bridge.ts";

const NAKA_ORIGIN = "https://naka.cx";
const CHALLENGE_TITLE = /just a moment|un instant/i;
const CHALLENGE_WAIT_MS = 45_000;
/** Kept between calls (and restarts, if on a volume) so Cloudflare's clearance cookie is reused. */
const PROFILE_DIR = process.env.BROWSER_PROFILE_DIR ?? "/tmp/naka-profile";

export interface NakaAccount {
  token: string;
  profileId: string;
}

interface PageAnswer extends NakaAnswer {
  challenged: boolean;
}

/** Still challenged after a fresh visit: the bridge says so instead of passing Cloudflare's 403 on. */
const CHALLENGE_FAILED: NakaAnswer = {
  status: 503,
  body: JSON.stringify({ error: "Cloudflare challenge not passed" }),
};

/**
 * One browser page kept open on naka.cx. Cloudflare lets a real, headed
 * browser through, so the API is called from inside the page, with the
 * cookies and fingerprint of the visit. Run under Xvfb. Naka's team allowed
 * getting past their anti-bot as long as their site never suffers from it.
 */
export class NakaPage implements NakaCaller {
  private readonly account: NakaAccount;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(account: NakaAccount) {
    this.account = account;
  }

  async call(apiPath: string): Promise<NakaAnswer> {
    try {
      return await this.callOnce(apiPath);
    } catch (cause) {
      // A crashed or closed browser: start over once with a fresh one.
      console.warn("Naka page lost, reopening", cause);
      await this.close();
      return this.callOnce(apiPath);
    }
  }

  async close(): Promise<void> {
    const context = this.context;
    this.context = null;
    this.page = null;
    await context?.close().catch(() => undefined);
  }

  private async callOnce(apiPath: string): Promise<NakaAnswer> {
    const page = await this.openPage();
    const answer = await this.fetchIn(page, apiPath);
    if (!answer.challenged) return answer;
    // Cloudflare wants a fresh check: visiting the site lets the browser pass it and renews the clearance.
    console.info("Cloudflare challenge on the API, visiting naka.cx again");
    await this.visit(page);
    const retried = await this.fetchIn(page, apiPath);
    return retried.challenged ? CHALLENGE_FAILED : retried;
  }

  private async openPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    this.context ??= await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      locale: "fr-FR",
      viewport: { width: 1280, height: 800 },
      // Playwright's automation markers (navigator.webdriver…) make Cloudflare's check fail every time.
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--disable-blink-features=AutomationControlled"],
    });
    const page = this.context.pages()[0] ?? (await this.context.newPage());
    await this.visit(page);
    this.page = page;
    return page;
  }

  private async visit(page: Page): Promise<void> {
    await page.goto(NAKA_ORIGIN, { waitUntil: "domcontentloaded", timeout: CHALLENGE_WAIT_MS });
    try {
      await page.waitForFunction((pattern) => !new RegExp(pattern, "i").test(document.title), CHALLENGE_TITLE.source, {
        timeout: CHALLENGE_WAIT_MS,
      });
    } catch (cause) {
      console.warn(`Cloudflare challenge still shown on naka.cx: "${await page.title()}"`);
      throw cause;
    }
    console.info(`Naka page ready: ${await page.title()}`);
  }

  private fetchIn(page: Page, apiPath: string): Promise<PageAnswer> {
    return page.evaluate(
      async ({ url, token, profileId }) => {
        const response = await fetch(url, {
          headers: { accept: "application/json", authorization: `Bearer ${token}`, "x-profile-id": profileId },
        });
        return {
          status: response.status,
          body: await response.text(),
          challenged: response.headers.get("cf-mitigated") === "challenge",
        };
      },
      { url: `/api/v1/${apiPath}`, ...this.account },
    );
  }
}
