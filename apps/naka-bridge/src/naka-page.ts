import { type Browser, chromium, type Page } from "playwright";
import type { NakaAnswer, NakaCaller } from "./bridge.ts";

const NAKA_ORIGIN = "https://naka.cx";
const CHALLENGE_TITLE = /just a moment|un instant/i;
const CHALLENGE_WAIT_MS = 30_000;

export interface NakaAccount {
  token: string;
  profileId: string;
}

interface PageAnswer extends NakaAnswer {
  challenged: boolean;
}

/**
 * One browser page kept open on naka.cx. Cloudflare lets a real, headed
 * browser through (headless is stopped), so the API is called from inside the
 * page, with the cookies and fingerprint of the visit. Run under Xvfb.
 */
export class NakaPage implements NakaCaller {
  private readonly account: NakaAccount;
  private browser: Browser | null = null;
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
    const browser = this.browser;
    this.browser = null;
    this.page = null;
    await browser?.close().catch(() => undefined);
  }

  private async callOnce(apiPath: string): Promise<NakaAnswer> {
    const page = await this.openPage();
    const answer = await this.fetchIn(page, apiPath);
    if (!answer.challenged) return answer;
    // Cloudflare's clearance ran out: visiting the site again renews it.
    await this.visit(page);
    return this.fetchIn(page, apiPath);
  }

  private async openPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    this.browser ??= await chromium.launch({ headless: false });
    const page = await this.browser.newPage({ locale: "fr-FR" });
    await this.visit(page);
    this.page = page;
    return page;
  }

  private async visit(page: Page): Promise<void> {
    await page.goto(NAKA_ORIGIN, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((pattern) => !new RegExp(pattern, "i").test(document.title), CHALLENGE_TITLE.source, {
      timeout: CHALLENGE_WAIT_MS,
    });
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
