import { expect, test } from "@playwright/test";
import { createSession, HLS_URL, onboard, person, videoTime } from "./helpers.ts";

test("à la fin d'un épisode, le suivant démarre chez tout le monde", async ({ browser }) => {
  const darius = await person(browser);
  const anna = await person(browser);

  await onboard(darius, "Darius");
  const roomUrl = await createSession(darius, "The Bear");
  await onboard(anna, "Anna", roomUrl);
  await expect(darius.getByRole("heading", { name: "Anna est là" })).toBeVisible();
  await darius.getByRole("button", { name: "Lancer le film" }).click();
  await expect.poll(() => videoTime(anna), { timeout: 30_000 }).toBeGreaterThan(1);

  // Anna queues the next episode from « Épisodes »; the label is guessed for her.
  await anna.mouse.move(10, 10);
  await anna.getByRole("button", { name: "Épisodes", exact: true }).click();
  // Adding opens on the title search; a link stays one tap away.
  await anna.getByRole("button", { name: "Coller un lien" }).click();
  await anna.getByLabel("Lien de l'épisode d'après (.m3u8)").fill(HLS_URL);
  await expect(anna.getByLabel("Titre", { exact: true })).toHaveValue("Épisode 2");
  await anna.getByRole("button", { name: "Ajouter à la suite" }).click();
  await expect(anna.getByRole("dialog", { name: "Épisodes" })).toBeHidden({ timeout: 30_000 });
  // Everyone else reads who changed the queue; Anna, who did it, is not told.
  await expect(darius.getByText("Anna a ajouté Épisode 2 à la file")).toBeVisible({ timeout: 15_000 });
  await expect(anna.getByText("Anna a ajouté Épisode 2 à la file")).toBeHidden();

  // Darius jumps to the end: the countdown shows on both screens.
  await darius.mouse.move(20, 20);
  const position = darius.getByRole("slider", { name: "Position dans le film" });
  await position.focus();
  await position.press("End");
  for (const page of [darius, anna]) {
    await expect(page.getByRole("button", { name: "Lancer pour tout le monde" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Épisode 2" })).toBeVisible();
  }

  // One tap starts it for everyone: the same séance, the next episode, from its start.
  await anna.getByRole("button", { name: "Lancer pour tout le monde" }).click();
  for (const page of [darius, anna]) {
    await expect(page.getByText("The Bear · Épisode 2")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Lancer pour tout le monde" })).toBeHidden();
  }
  await expect.poll(() => videoTime(darius), { timeout: 30_000 }).toBeGreaterThan(1);
  expect(await videoTime(darius)).toBeLessThan(60);

  // The episode watched stays in the menu, ticked: picking it takes everyone back to it.
  await darius.mouse.move(30, 30);
  await darius.getByRole("button", { name: "Épisodes", exact: true }).click();
  await darius.getByRole("button", { name: "Regarder Épisode 1, Vu" }).click();
  await expect(anna.getByText("Darius a lancé l'épisode 1")).toBeVisible({ timeout: 15_000 });
  await expect(anna.getByText("The Bear · Épisode 2")).toBeHidden();

  // Mid-episode, « Épisode suivant » skips everyone ahead without waiting for the end.
  await anna.mouse.move(40, 40);
  await anna.getByRole("button", { name: "Épisode suivant" }).click();
  for (const page of [darius, anna]) {
    await expect(page.getByText("The Bear · Épisode 2")).toBeVisible({ timeout: 15_000 });
  }
});
