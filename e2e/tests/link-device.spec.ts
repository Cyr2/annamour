import { expect, type Page } from "@playwright/test";
import { onboard, person, test } from "./helpers.ts";

async function linkToken(page: Page): Promise<string> {
  const response = await page.request.post("/api/me/link-token");
  return ((await response.json()) as { token: string }).token;
}

const signedInAs = async (page: Page) =>
  ((await (await page.request.get("/api/me")).json()) as { account: { name: string } }).account.name;

test("scanner le QR d'un autre compte demande d'abord, et Annuler laisse tout tel quel", async ({ browser }) => {
  const darius = await person(browser);
  const lea = await person(browser);
  await onboard(darius, "Darius");
  await onboard(lea, "Léa");
  const token = await linkToken(darius);

  await lea.goto(`/lier#${token}`);
  await expect(
    lea.getByRole("heading", { name: "Remplacer le compte de Léa par celui de Darius sur cet appareil ?" }),
  ).toBeVisible();
  await expect(lea.getByRole("list", { name: "Les 4 mots du compte de Léa" }).getByRole("listitem")).toHaveCount(4);
  await lea.getByRole("button", { name: "Annuler" }).click();
  await expect(lea).toHaveURL(/\/$/);
  expect(await signedInAs(lea)).toBe("Léa");

  // The code was not used: scanning it again and accepting switches the device over.
  await lea.goto(`/lier#${token}`);
  await lea.getByRole("button", { name: "Remplacer par Darius" }).click();
  await expect(lea).toHaveURL(/\/$/);
  expect(await signedInAs(lea)).toBe("Darius");

  // Darius's own code on his own device: nothing to ask.
  await darius.goto(`/lier#${await linkToken(darius)}`);
  await expect(darius).toHaveURL(/\/$/);
  expect(await signedInAs(darius)).toBe("Darius");
});
