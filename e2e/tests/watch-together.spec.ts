import { type Browser, expect, type Page, test } from "@playwright/test";

/** A real, public HLS stream by default; set E2E_HLS_URL to try another one (e.g. a Naka link). */
const HLS_URL = process.env.E2E_HLS_URL ?? "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
const MAX_DRIFT_SECONDS = 1;

/** Each person has their own browser profile: separate cookies, separate account. */
async function person(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

/** First launch: name, then the key, then « Plus tard » for the passkey. */
async function onboard(page: Page, name: string, path = "/") {
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
  if (await later.isVisible()) await later.click();
}

const videoTime = (page: Page) => page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime);
const videoPaused = (page: Page) => page.locator("video").evaluate((v: HTMLVideoElement) => v.paused);

async function expectInStep(a: Page, b: Page) {
  const [ta, tb] = await Promise.all([videoTime(a), videoTime(b)]);
  expect(Math.abs(ta - tb), `drift between ${ta.toFixed(2)} s and ${tb.toFixed(2)} s`).toBeLessThan(MAX_DRIFT_SECONDS);
}

test("deux personnes regardent le même film, synchronisées", async ({ browser }) => {
  const darius = await person(browser);
  const anna = await person(browser);

  // Darius arrives, creates a séance from a real HLS link.
  await onboard(darius, "Darius");
  await darius.getByRole("button", { name: "Créer une séance" }).click();
  await darius.getByLabel("Lien de la vidéo (.m3u8)").fill(HLS_URL);
  await darius.getByLabel("Nom de la séance").fill("Test de bout en bout");
  await darius.getByRole("button", { name: "Préparer la séance" }).click();
  await darius.getByRole("button", { name: "Ouvrir la séance" }).click();
  await expect(darius).toHaveURL(/\/s\/[A-Z]{4}$/);
  const roomUrl = new URL(darius.url()).pathname;

  // Anna opens the shared link, does her first launch, and lands back in the salon.
  await onboard(anna, "Anna", roomUrl);
  await expect(anna).toHaveURL(new RegExp(`${roomUrl}$`));
  await expect(darius.getByRole("heading", { name: "Anna est là" })).toBeVisible();

  // Darius starts the film: after the 3-2-1, both are watching.
  await darius.getByRole("button", { name: "Lancer le film" }).click();
  await expect.poll(() => videoTime(darius), { timeout: 30_000 }).toBeGreaterThan(2);
  await expect.poll(() => videoTime(anna), { timeout: 30_000 }).toBeGreaterThan(2);
  await darius.waitForTimeout(4000);
  await expectInStep(darius, anna);

  // Anna pauses: Darius pauses too, at the same image.
  await anna.mouse.move(10, 10);
  await anna.getByRole("button", { name: "Pause", exact: true }).click();
  await expect.poll(() => videoPaused(darius)).toBe(true);
  await expect(darius.getByText("Anna a mis en pause")).toBeVisible();
  await expectInStep(darius, anna);

  // Darius moves forward 10 s and plays: Anna follows.
  const before = await videoTime(anna);
  await darius.mouse.move(20, 20);
  await darius.getByRole("button", { name: "Avancer de 10 secondes" }).click();
  await expect.poll(() => videoTime(anna)).toBeGreaterThan(before + 8);
  await darius.getByRole("button", { name: "Lecture", exact: true }).click();
  await expect.poll(() => videoPaused(anna)).toBe(false);
  await anna.waitForTimeout(3000);
  await expectInStep(darius, anna);

  // A reaction from Anna appears on Darius's screen.
  await anna.mouse.move(30, 30);
  await anna.getByRole("button", { name: "Envoyer une réaction" }).click();
  await anna.getByRole("menuitem", { name: "Cœur" }).click();
  await expect(darius.getByRole("img", { name: "Anna : ❤️" })).toBeVisible();
});
