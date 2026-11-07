import { expect, type Page, test } from "@playwright/test";
import { HLS_URL, onboard, person } from "./helpers.ts";

/** Ticks « Nouvelle interface » on this device's profile; home then shows « Ce soir ». */
async function tryCircles(page: Page) {
  await page.goto("/profil");
  await page.getByRole("switch", { name: "Nouvelle interface" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** « Créer une séance » in two steps: the title, then the salon opens by itself. */
async function createSeance(page: Page, title: string): Promise<string> {
  await page.getByRole("button", { name: "Créer une séance" }).click();
  await page.getByRole("button", { name: "Coller un lien" }).click();
  await page.getByLabel("Lien de la vidéo (.m3u8)").fill(HLS_URL);
  await page.getByLabel("Nom de la séance").fill(title);
  await page.getByRole("button", { name: "Préparer la séance" }).click();
  await expect(page).toHaveURL(/\/s\/[A-Z]{4}$/);
  return new URL(page.url()).pathname;
}

test("la nouvelle interface range les séances par cercle, sans changer les données", async ({ browser }) => {
  const darius = await person(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const annou = await person(browser);
  await onboard(darius, "Darius");
  await tryCircles(darius);

  // « Ce soir » keeps the promise, then three tabs.
  await expect(darius.getByRole("heading", { name: "Une soirée ensemble" })).toBeVisible();
  const tabs = darius.getByRole("navigation", { name: "Navigation" });
  for (const name of ["Ce soir", "Notre liste", "Nous"]) await expect(tabs.getByRole("link", { name })).toBeVisible();

  // A séance watched together forms their circle on its own.
  const room = await createSeance(darius, "Premier film");
  await onboard(annou, "Annou", room);
  await expect(darius.getByRole("heading", { name: "Annou est là" })).toBeVisible();
  await darius.goto("/nous");
  await expect(darius.getByText("Annou et toi")).toBeVisible();

  // Upright, the player's bar is one row; the rest is behind « ⋯ ».
  await darius.goto(room);
  await darius.getByRole("button", { name: "Lancer le film" }).click();
  await darius.waitForTimeout(3000);
  await darius.mouse.move(100, 300);
  await darius.getByRole("button", { name: "Plus d'options" }).click();
  await expect(darius.getByRole("button", { name: /Audio et sous-titres/ })).toBeVisible();

  // Back to the classic interface: the same séance is there.
  await darius.goto("/nous");
  await darius.getByRole("switch", { name: "Nouvelle interface" }).click();
  await darius.goto("/profil");
  await expect(darius.getByText("Premier film").first()).toBeVisible();
});
