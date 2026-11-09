import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { createSession, onboard, person, test } from "./helpers.ts";

/** With E2E_SHOTS set, keeps a picture of each step in e2e/dist (ignored by git). */
const shot = async (page: Page, name: string) => {
  if (!process.env.E2E_SHOTS) return;
  // Lets sheets, cards and toasts finish arriving.
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(import.meta.dirname, "../dist", `${name}.png`) });
};

type CircleList = { circles: { id: string; members: { name: string }[] }[] };

test("deux cercles devenus identiques se réunissent sur demande, et les autres en sont prévenus", async ({
  browser,
}) => {
  const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  const darius = await person(browser, phone);
  const annou = await person(browser, phone);
  const leo = await person(browser);
  await onboard(darius, "Darius");

  // Darius and Annou watch once together: their circle forms by itself.
  const duo = await createSession(darius, "Rien que nous");
  await onboard(annou, "Annou", duo);
  await expect(darius.getByRole("heading", { name: "Annou est là" })).toBeVisible();
  await onboard(leo, "Léo");
  const circlesOf = async (page: Page) =>
    ((await (await page.request.get("/api/me/circles")).json()) as CircleList).circles;

  // Darius makes « Les potes du jeudi » and invites Annou and Léo (a séance's circle is fixed: Léo
  // joining theirs would only be a guest), then Léo leaves it: two circles of the same two people.
  const created = await darius.request.post("/api/me/circles", { data: { name: "Les potes du jeudi" } });
  const { id } = (await created.json()) as { id: string };
  const { token } = (await (await darius.request.post(`/api/me/circles/${id}/invite`)).json()) as { token: string };
  for (const someone of [annou, leo])
    expect((await someone.request.post("/api/me/circles/join", { data: { token } })).status()).toBe(200);
  expect((await leo.request.delete(`/api/me/circles/${id}`)).status()).toBe(204);

  await darius.goto("/nous");
  const offer = darius.getByRole("region", { name: "Deux cercles identiques" });
  // The two names come in the order of « Nous », whichever it is.
  await expect(offer).toContainText("c'est maintenant le même cercle.");
  await expect(offer).toContainText("« Les potes du jeudi »");
  await expect(offer).toContainText("« Annou et toi »");
  await shot(darius, "1-carte-les-reunir");

  // « ⋯ » offers the same, as long as another circle has the same people.
  await darius.getByRole("button", { name: "Plus d'options pour « Annou et toi »" }).click();
  await expect(darius.getByRole("button", { name: /Réunir avec…/ })).toBeVisible();
  await darius.keyboard.press("Escape");

  await offer.getByRole("button", { name: "Réunir" }).click();
  const sheet = darius.getByRole("dialog", { name: "Réunir les cercles" });
  await expect(sheet.getByRole("radio", { name: "Les potes du jeudi" })).toBeChecked();
  await shot(darius, "2-feuille-du-nom");

  await sheet.getByRole("button", { name: "Réunir" }).click();
  await expect(darius.getByText("Cercles réunis : « Les potes du jeudi »")).toBeVisible();
  await expect(offer).toBeHidden();
  await shot(darius, "3-cercles-reunis");
  expect(await circlesOf(darius)).toHaveLength(1);

  await annou.goto("/nous");
  await expect(annou.getByText("Darius a réuni vos deux cercles")).toBeVisible();
  await shot(annou, "4-annou-prevenue");
});
