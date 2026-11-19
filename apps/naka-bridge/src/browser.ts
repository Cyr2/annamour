import { type BrowserContext, chromium } from "playwright";

/** Kept between calls (and restarts, if on a volume) so Cloudflare's clearance cookies are reused. */
const PROFILE_DIR = process.env.BROWSER_PROFILE_DIR ?? "/tmp/naka-profile";

let context: Promise<BrowserContext> | null = null;

function launch(): Promise<BrowserContext> {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    locale: "fr-FR",
    viewport: { width: 1280, height: 800 },
    // Playwright's automation markers (navigator.webdriver…) make Cloudflare's check fail every time.
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

/**
 * The one headed browser both sites are read in, a tab each: a second
 * Chromium would double the memory for nothing.
 */
export function sharedContext(): Promise<BrowserContext> {
  if (context === null) {
    const launched = launch();
    context = launched;
    // A crashed browser is started again on the next call.
    void launched.then(
      (opened) => opened.on("close", () => context === launched && closeShared()),
      () => context === launched && closeShared(),
    );
  }
  return context;
}

export async function closeSharedContext(): Promise<void> {
  const closing = context;
  context = null;
  await (await closing?.catch(() => null))?.close().catch(() => undefined);
}

function closeShared(): void {
  context = null;
}
