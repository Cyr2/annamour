import { expect } from "@playwright/test";
import { createSession, onboard, person, test, videoTime } from "./helpers.ts";

test("quitter pendant le générique demande si c'est fini, et la séance compte comme terminée", async ({ browser }) => {
  const darius = await person(browser);
  await onboard(darius, "Darius");
  await createSession(darius, "Fin de soirée");

  await darius.getByRole("button", { name: "Lancer le film" }).click();
  await expect.poll(() => videoTime(darius), { timeout: 30_000 }).toBeGreaterThan(1);
  // The test film lasts about 10 min 34: at 85 %, 1 min 35 before its end, past its last fifth, before the last minute.
  await darius.mouse.move(40, 40);
  const timeline = darius.getByRole("slider", { name: "Position dans le film" });
  const box = await timeline.boundingBox();
  if (!box) throw new Error("no timeline");
  await darius.mouse.click(box.x + box.width * 0.85, box.y + box.height / 2);
  await expect.poll(() => videoTime(darius), { timeout: 15_000 }).toBeGreaterThan(510);

  await darius.mouse.move(40, 40);
  await darius.getByRole("link", { name: "Quitter le film" }).click();
  const question = darius.getByRole("dialog", { name: "C'est fini ?" });
  await expect(question).toBeVisible();
  await expect(question).toContainText("Tu as quitté « Fin de soirée »");
  await question.getByRole("button", { name: "Oui, c'est fini" }).click();
  await expect(darius.getByText("« Fin de soirée » est terminée")).toBeVisible();

  await darius.goto("/seances");
  await expect(darius.getByText("Terminée").first()).toBeVisible();
});
