import { expect, type Page, test } from "@playwright/test";
import { createSession, onboard, person, videoPaused, videoTime } from "./helpers.ts";

const MAX_DRIFT_SECONDS = 1;

async function expectInStep(a: Page, b: Page) {
  const [ta, tb] = await Promise.all([videoTime(a), videoTime(b)]);
  expect(Math.abs(ta - tb), `drift between ${ta.toFixed(2)} s and ${tb.toFixed(2)} s`).toBeLessThan(MAX_DRIFT_SECONDS);
}

test("deux personnes regardent le même film, synchronisées", async ({ browser }) => {
  const darius = await person(browser);
  const anna = await person(browser);

  // Darius arrives, creates a séance from a real HLS link.
  await onboard(darius, "Darius");
  const roomUrl = await createSession(darius, "Test de bout en bout");

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
