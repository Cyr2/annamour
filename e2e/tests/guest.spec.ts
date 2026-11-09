import { expect, test } from "@playwright/test";
import { createSession, onboard, person } from "./helpers.ts";

test("rejoindre avec un prénom sans compte, puis voir la séance", async ({ browser }) => {
  const darius = await person(browser);
  const lea = await person(browser);
  await onboard(darius, "Darius");
  const roomUrl = await createSession(darius, "Séance sans compte");

  // Léa opens the link without an account: two clear ways in, and no account made yet.
  await lea.goto(roomUrl);
  await expect(lea).toHaveURL(new RegExp(`${roomUrl}$`));
  await expect(lea.getByRole("button", { name: /J'ai déjà un compte/ })).toBeVisible();
  await lea.getByRole("button", { name: /Entrer avec un prénom/ }).click();
  await lea.getByLabel("Ton prénom").fill("Léa");
  await lea.getByRole("button", { name: "Entrer dans la séance" }).click();

  // She is in the salon with Darius, as a guest.
  await expect(lea.getByRole("heading", { name: "Darius est là" })).toBeVisible();
  await expect(darius.getByRole("heading", { name: "Léa est là" })).toBeVisible();
  expect((await lea.request.get("/api/me")).status()).toBe(401);

  // « Garder cette séance »: her account is made, and the séance is now in her séances.
  await lea.getByRole("button", { name: "Garder cette séance : créer mon compte" }).click();
  await expect(lea).toHaveURL(/\/bienvenue/);
  await expect(lea.getByLabel("Ton prénom")).toHaveValue("Léa");
  await lea.getByRole("button", { name: "Continuer" }).click();
  await lea.getByRole("button", { name: "Je l'ai notée" }).click();
  const later = lea.getByRole("button", { name: "Plus tard" });
  await later.waitFor({ timeout: 3000 }).catch(() => {});
  if (await later.isVisible()) await later.click({ force: true });
  await expect(lea).toHaveURL(new RegExp(`${roomUrl}$`));

  const sessions = await (await lea.request.get("/api/me/sessions")).json();
  expect(sessions.sessions).toMatchObject([{ code: roomUrl.slice(3), title: "Séance sans compte" }]);
});
