import { type Browser, type BrowserContextOptions, expect, type Page } from "@playwright/test";

/** A real, public HLS stream by default; set E2E_HLS_URL to try another one (e.g. a Naka link). */
export const HLS_URL = process.env.E2E_HLS_URL ?? "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

/** Each person (or device) has their own browser profile: separate cookies, separate account. */
export async function person(browser: Browser, options: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext(options);
  return context.newPage();
}

/** First launch: name, then the key, then « Plus tard » for the passkey. */
export async function onboard(page: Page, name: string, path = "/") {
  await page.goto(path);
  await expect(page).toHaveURL(/\/bienvenue/);
  await page.getByLabel("Ton prénom").fill(name);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Voici ta clé" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Ta clé de 4 mots" }).getByRole("listitem")).toHaveCount(4);
  await page.getByRole("button", { name: "Je l'ai notée" }).click();
  // The Face ID step is optional (only where passkeys exist) and slides in: give it a moment to appear.
  const later = page.getByRole("button", { name: "Plus tard" });
  await later.waitFor({ timeout: 3000 }).catch(() => {});
  // The step slides in over the last one: an optional step, so no waiting for the slide to settle.
  if (await later.isVisible()) await later.click({ force: true });
}

/** From home, creates a séance from an HLS link (the public test stream by default) and opens its salon; returns its path. */
export async function createSession(page: Page, title: string, url = HLS_URL): Promise<string> {
  await page.getByRole("button", { name: "Créer une séance" }).click();
  // The sheet opens on the title search; a link stays one tap away.
  await page.getByRole("button", { name: "Coller un lien" }).click();
  await page.getByLabel("Lien de la vidéo (.m3u8)").fill(url);
  await page.getByLabel("Nom de la séance").fill(title);
  await page.getByRole("button", { name: "Préparer la séance" }).click();
  await page.getByRole("button", { name: "Ouvrir la séance" }).click();
  await expect(page).toHaveURL(/\/s\/[A-Z]{4}$/);
  return new URL(page.url()).pathname;
}

export const videoTime = (page: Page) => page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime);
export const videoPaused = (page: Page) => page.locator("video").evaluate((v: HTMLVideoElement) => v.paused);
