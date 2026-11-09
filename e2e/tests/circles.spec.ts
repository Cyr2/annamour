import { expect, test } from "@playwright/test";
import { createSession, onboard, person } from "./helpers.ts";

test("les séances se rangent par cercle : Ce soir, Notre liste et Nous", async ({ browser }) => {
  const darius = await person(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const annou = await person(browser);
  await onboard(darius, "Darius");

  // « Ce soir » keeps the promise, then three tabs.
  await expect(darius.getByRole("heading", { name: "Une soirée ensemble" })).toBeVisible();
  const tabs = darius.getByRole("navigation", { name: "Navigation" });
  for (const name of ["Ce soir", "Notre liste", "Nous"]) await expect(tabs.getByRole("link", { name })).toBeVisible();

  // A séance watched together forms their circle on its own; it opens in two steps.
  const room = await createSession(darius, "Premier film");
  await onboard(annou, "Annou", room);
  await expect(darius.getByRole("heading", { name: "Annou est là" })).toBeVisible();
  await darius.goto("/nous");
  await expect(darius.getByText("Annou et toi")).toBeVisible();

  // Every séance has its place: « Toutes mes séances » lists it, under way.
  await darius.getByRole("link", { name: /Toutes mes séances/ }).click();
  await expect(darius.getByRole("heading", { name: /En cours/ })).toBeVisible();
  await expect(darius.getByText("Premier film")).toBeVisible();

  // The former addresses lead to their counterparts.
  await darius.goto("/profil");
  await expect(darius).toHaveURL(/\/nous$/);
  await darius.goto("/a-regarder");
  await expect(darius).toHaveURL(/\/liste$/);

  // Upright, the player's bar is one row; the rest is behind « ⋯ ».
  await darius.goto(room);
  await darius.getByRole("button", { name: "Lancer le film" }).click();
  await darius.waitForTimeout(3000);
  await darius.mouse.move(100, 300);
  await darius.getByRole("button", { name: "Plus d'options" }).click();
  await expect(darius.getByRole("button", { name: /Audio et sous-titres/ })).toBeVisible();
});
